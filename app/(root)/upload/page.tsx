'use client'

import FileInput from "@/components/FileInput"
import FormField from "@/components/FormField"
import { MAX_THUMBNAIL_SIZE, MAX_VIDEO_SIZE } from "@/constants"
import { getThumbnailUploadUrl, getVideoUploadUrl, saveVideoDetails } from "@/lib/actions/video"
import { useFileInput } from "@/lib/hooks/useFileInput"
import { useRouter } from "next/navigation"
import { ChangeEvent, FormEvent, useEffect, useState } from "react"


const uploadFileToBunny = (file: File, uploadUrl: string, accessKey: string): Promise<void> => {
    console.log('Iniciando uploadFileToBunny')
    console.log(`dentro de uploadFileToBunny, uploadUrl: ${uploadUrl}, accessKey: ${accessKey}, file: ${file}`)
    return fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
            'Content-Type': file.type,
            'AccessKey': accessKey
        }
    }).then((response) => {
        if (!response.ok) {
            throw new Error('Failed to upload file to Bunny')
        }
    })
}
const Upload = () => {
    const router = useRouter()

    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [videoDuration, setVideoDuration] = useState(0)
    const [formData, setFormData] = useState<VideoFormValues>({
        title: "",
        description: "",
        tags: "",
        visibility: "public",
    });



    const video = useFileInput(MAX_VIDEO_SIZE)
    const thumbnail = useFileInput(MAX_THUMBNAIL_SIZE)

    useEffect(() => {
        if (video.duration) {
            setVideoDuration(video.duration)
        }
    }, [video.duration])

    useEffect(() => {
        const checkForRecordedVideo = async () => {
            try {
                const stored = sessionStorage.getItem('recordedVideo');
                console.log ('stored: ', stored)
                if (!stored) return;

                const { url, name, type, duration } = JSON.parse(stored);
                const blob = await fetch(url).then((res) => res.blob())
                const file = new File([blob], name, { type, lastModified: Date.now() });

                if (video.inputRef.current) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    video.inputRef.current.files = dataTransfer.files;

                    const event = new Event('change', { bubbles: true });
                    video.inputRef.current.dispatchEvent(event);

                    video.handleFileChange({
                        target: { files: dataTransfer.files }
                    } as ChangeEvent<HTMLInputElement>)
                }

                if (duration) setVideoDuration(duration)

                sessionStorage.removeItem('recordedVideo')
                URL.revokeObjectURL(url);
            } catch (e) {
                console.error(e, 'Error loading recorded video')
            }
        }

        checkForRecordedVideo()
    }, [video])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        setFormData((prevState) => ({
            ...prevState,
            [name]: value,
        }));
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        console.log('Iniciando handleSubmit')
        setIsSubmitting(true)

        try {
            console.log('Iniciando try')

            if (!video.file || !thumbnail.file) {
                setError('Please upload a video and thumbnail')
                return
            }

            if (!formData.title || !formData.description) {
                setError('Please fill in all the details')
                return
            }

            //Upload the video to Bunny
            console.log('Subiendo archivo a Bunny')

            const {
                videoId,
                uploadUrl: videoUploadUrl,
                accessKey: videoAccessKey
            } = await getVideoUploadUrl()

            console.log({ videoId, videoUploadUrl, videoAccessKey })

            if (!videoUploadUrl || !videoAccessKey) throw new Error('Failed to get video upload credentials')

            console.log('Antes de uploadFileToBunny')

            await uploadFileToBunny(video.file, videoUploadUrl, videoAccessKey)

            //Upload the thumbnail to DB
            const {
                uploadUrl: thumbnailUploadUrl,
                accessKey: thumbnailAccessKey,
                cdnUrl: thumbnailCdnUrl,
            } = await getThumbnailUploadUrl(videoId)

            if (!thumbnailUploadUrl || !thumbnailCdnUrl || !thumbnailAccessKey) throw new Error('Failed to get thumbnail upload credentials')

            //Attach the thumbnail to the video
            await uploadFileToBunny(thumbnail.file, thumbnailUploadUrl, thumbnailAccessKey)
            //Create a new DB entry for the video details
            await saveVideoDetails({
                videoId,
                thumbnailUrl: thumbnailCdnUrl,
                ...formData,
                duration: videoDuration
            })
            console.log('videoId: ', videoId)

            router.push('/')
        } catch (error) {
            console.log('Error submitting video:', error);
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="wrapper-md upload-page">
            <h1>Upload a video</h1>

            {error && <div className="error-field">{error}</div>}

            <form action="" className="rounded-20 shadow-10 gap-6 w-full flex flex-col px-5 py-7.5" onSubmit={handleSubmit}>
                <FormField
                    id='title'
                    label='Title'
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder='Enter a clear and concise video title'
                />

                <FormField
                    id='description'
                    label='Description'
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder='Describe what this video is about'
                    as='textarea'
                />

                <FileInput
                    id='video'
                    label='Video'
                    accept='video/*'
                    file={video.file}
                    previewUrl={video.previewUrl}
                    inputRef={video.inputRef}
                    onChange={video.handleFileChange}
                    onReset={video.resetFile}
                    type='video'
                />

                <FileInput
                    id='thumbnail'
                    label='Thumbnail'
                    accept='image/*'
                    file={thumbnail.file}
                    previewUrl={thumbnail.previewUrl}
                    inputRef={thumbnail.inputRef}
                    onChange={thumbnail.handleFileChange}
                    onReset={thumbnail.resetFile}
                    type='image'
                />

                <FormField
                    id='visibility'
                    label='Visibility'
                    value={formData.visibility}
                    onChange={handleInputChange}
                    as='select'
                    options={[
                        { value: 'public', label: 'Public' },
                        { value: 'private', label: 'Private' },
                    ]}
                />
                <button type="submit" disabled={isSubmitting} className="submit-button">
                    {isSubmitting ? 'Uploading...' : 'Upload video'}
                </button>
            </form>

        </div>
    )
}

export default Upload