"use server";

import { apiFetch, doesTitleMatch, getEnv, getOrderByClause, withErrorHandling } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { BUNNY } from "@/constants";
import { db } from "@/drizzle/db";
import { user, videos } from "@/drizzle/schema";
import { revalidatePath } from "next/cache";
import aj from "../arcjet";
import { fixedWindow, request } from "@arcjet/next";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

const VIDEO_STREAM_BASE_URL = BUNNY.STREAM_BASE_URL;
const THUMBNAIL_STORAGE_BASE_URL = BUNNY.STORAGE_BASE_URL;
const THUMBNAIL_CDN_URL = BUNNY.CDN_URL;
const BUNNY_LIBRARY_ID = getEnv("BUNNY_LIBRARY_ID");
const ACCESS_KEYS = {
  streamAccessKey: getEnv("BUNNY_STREAM_ACCESS_KEY"),
  storageAccessKey: getEnv("BUNNY_STORAGE_ACCESS_KEY"),
};

// Helper Functions
const getSessionUserId = async (): Promise<string> => {
  console.log("iniciando getSessionUserId");

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) throw new Error("Unauthenticated");
  console.log("session.user.id: ", session.user.id);
  return session.user.id;
};

const revalidatePaths = (paths: string[]) => {
  paths.forEach((path) => revalidatePath(path));
};

const buildVideoWithUserQuery = () => {
  return db
    .select({
      video:videos,
      user: {id: user.id, name: user.name, image: user.image},
    })
    .from(videos)
    .leftJoin(user, eq(videos.userId, user.id));
}

// Validate Function (Arcjet)
const  validateWithArcjet = async (fingerprint: string) => {
  const rateLimit = aj.withRule(
    fixedWindow({
      mode:'LIVE',
      window:'1m',
      max: 2,
      characteristics:['fingerprint']
    })
  )

  const req = await request();
  const decision = await rateLimit.protect(req, {fingerprint});

  if(decision.isDenied()) {
    throw new Error('Rate Limit Exceeded');
  }
}

// Server Actions
export const getVideoUploadUrl = withErrorHandling(async () => {
  console.log("Iniciando getVideoUploadUrl");

  await getSessionUserId();
  console.log('antes del post de getVideoUploadUrl');
  const videoResponse = await apiFetch<BunnyVideoResponse>(
    `${VIDEO_STREAM_BASE_URL}/${BUNNY_LIBRARY_ID}/videos`,
    {
      method: "POST",
      bunnyType: "stream",
      body: { title: "Temporary Title", collectionId: "" },
    }
  );
  console.log('videoResponse: ', videoResponse);
  const uploadUrl = `${VIDEO_STREAM_BASE_URL}/${BUNNY_LIBRARY_ID}/videos/${videoResponse.guid}`;

  console.log('uploadUrl: ', uploadUrl);
  console.log({'videoResponse.guid: ': videoResponse.guid, 'uploadUrl: ': uploadUrl, 'accessKey: ': ACCESS_KEYS.streamAccessKey});
  return {
    videoId: videoResponse.guid,
    uploadUrl,
    accessKey: ACCESS_KEYS.streamAccessKey,
  };
});

export const getThumbnailUploadUrl = withErrorHandling(
  async (videoId: string) => {
    const fileName = `${Date.now()}-${videoId}-thumbnail`;
    const uploadUrl = `${THUMBNAIL_STORAGE_BASE_URL}/thumbnails/${fileName}`;
    const cdnUrl = `${THUMBNAIL_CDN_URL}/thumbnails/${fileName}`;

    return {
      uploadUrl,
      cdnUrl,
      accessKey: ACCESS_KEYS.storageAccessKey,
    };
  }
);

export const saveVideoDetails = withErrorHandling(
  async (videoDetails: VideoDetails) => {
    console.log("iniciando saveVideoDetails")

    const userId = await getSessionUserId();

    // Validate Rate Limit
    await validateWithArcjet(userId);
    
    await apiFetch(
      `${VIDEO_STREAM_BASE_URL}/${BUNNY_LIBRARY_ID}/videos/${videoDetails.videoId}`,
      {
        method: "POST",
        bunnyType: "stream",
        body: {
          title: videoDetails.title,
          description: videoDetails.description,
          // tags: videoDetails.tags,
          // visibility: videoDetails.visibility as Visibility,
        },
      }
    );

    const now = new Date();

    await db.insert(videos).values({
      ...videoDetails,
      videoUrl: `${BUNNY.EMBED_URL}/${BUNNY_LIBRARY_ID}/${videoDetails.videoId}`,
      userId,
      createdAt: now,
      updatedAt: now,
    });

    revalidatePaths(["/"]);

    return { videoId: videoDetails.videoId };
  }
);

export const getAllVideos = withErrorHandling(async (
  searchQuery : string = '',
  sortFilter?: string,
  pageNumber: number= 1,
  pageSize: number = 8
) => {

  const session = await auth.api.getSession({ headers: await headers() });
  console.log('session: ', session)
  const currentUserId = session?.user.id;

  const canSeeTheVideos = or(
    eq(videos.visibility, 'public'),
    eq(videos.userId, currentUserId!)
  );
    
  const whereCondition = searchQuery.trim( )
    ? and (
      canSeeTheVideos,
      doesTitleMatch(videos, searchQuery)
    )
    : canSeeTheVideos

    const [{totalCount}] = await db
      .select({totalCount: sql<number>`count(*)`})
      .from(videos)
      .where(whereCondition);

    const totalVideos = Number(totalCount || 0);
    const totalPages = Math.ceil(totalVideos / pageSize);

    const videoRecords = await buildVideoWithUserQuery()
    .where(whereCondition)
    .orderBy(
      sortFilter ? getOrderByClause(sortFilter) : sql`${videos.createdAt} DESC`
    )
    .limit(pageSize)
    .offset((pageNumber - 1) * pageSize)

    return {
      videos: videoRecords,
      pagination:{
        currentPage: pageNumber,
        totalPages,
        pageSize,
        totalVideos
      }
    }

});

export const getVideoById = withErrorHandling(async (videoId: string) =>{
  const [videoRecord] = await buildVideoWithUserQuery().where(eq(videos.id, videoId))

  return videoRecord
})

export const getAllVideosByUser = withErrorHandling(
  async (
    userIdParameter: string,
    searchQuery: string = "",
    sortFilter?: string
  ) => {
    const currentUserId = (
      await auth.api.getSession({ headers: await headers() })
    )?.user.id;
    const isOwner = userIdParameter === currentUserId;

    const [userInfo] = await db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        email: user.email,
      })
      .from(user)
      .where(eq(user.id, userIdParameter));
    if (!userInfo) throw new Error("User not found");

    const conditions = [
      eq(videos.userId, userIdParameter),
      !isOwner && eq(videos.visibility, "public"),
      searchQuery.trim() && ilike(videos.title, `%${searchQuery}%`),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ].filter(Boolean) as any[];

    const userVideos = await buildVideoWithUserQuery()
      .where(and(...conditions))
      .orderBy(
        sortFilter ? getOrderByClause(sortFilter) : desc(videos.createdAt)
      );

    return { user: userInfo, videos: userVideos, count: userVideos.length };
  }
);

export const getTranscript = withErrorHandling(async (videoId: string) => {
  const response = await fetch(
    `${BUNNY.TRANSCRIPT_URL}/${videoId}/captions/en-auto.vtt`
  );
  // console.log(`Transcripturl: `, `${BUNNY.TRANSCRIPT_URL}/${videoId}/captions/en-auto.vtt`)
  // console.log(`response: `, response)
  return response.text();
});