import VideoDetailHeader from '@/components/VideoDetailHeader'
import VideoInfo from '@/components/VideoInfo'
import VideoPlayer from '@/components/VideoPlayer'
import { getTranscript, getVideoById } from '@/lib/actions/video'
import { redirect } from 'next/navigation'
import React from 'react'

const page = async ({ params }: Params) => {

  const { videoId } = await params

  const { user, video } = await getVideoById(videoId)
  console.log('video: ', video)

  if (!video) redirect('/404')
  
   const transcript = await getTranscript(videoId); 
   console.log('transcript: ', transcript)

  return (
    <main className="wrapper page">
      <VideoDetailHeader  {...video} userImg={user?.image} username={user?.name} ownerId={video.videoId}/>
      <section className="video-details">
        <div className="content">
          <VideoPlayer videoId={video.videoId} />
          <VideoInfo
          transcript={transcript}
          title={video.title}
          createdAt={video.createdAt}
          description={video.description}
          videoId={videoId}
          videoUrl={video.videoUrl}
        />
        </div>
      </section>
    </main>
  )
}

export default page