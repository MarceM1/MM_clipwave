import EmptyState from '@/components/EmptyState'
import Header from '@/components/Header'
import VideoCard from '@/components/VideoCard'
import { getAllVideos } from '@/lib/actions/video'
import React from 'react'

const Page = async ({ searchParams }: SearchParams) => {

  const { query, filter, page } = await searchParams;

  const {videos, pagination} = await getAllVideos(query, filter, Number(page) || 1)

  return (
    <main className='wrapper page'>
      <Header title='All Videos' subHeader='Public Library' />
      
       {
        videos?.length > 0 ?
        (
          <section className="video-grid">
            {
              videos.map(({video,user}) => (
                <VideoCard 
                key={video.id}  
                {...video} 
                userImg={user?.image || ''} 
                username={user?.name || 'Guest'}
                thumbnail={video.thumbnailUrl}
                />
              ))
            }
          </section>
        )
        :
        (
          <div className="no-videos">
            <EmptyState icon='/assets/icons/video.svg' title='No videos found' description='Try adjusting your search.' />
          </div>
        )
       }
      

    </main>
  )
}

export default Page