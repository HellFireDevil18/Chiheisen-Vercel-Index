import type { OdFileObject } from '../../types'

import { FC, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useTranslation } from 'next-i18next'

import axios from 'axios'
import toast from 'react-hot-toast'
import Plyr from 'plyr-react'
import type { APITypes } from 'plyr-react'
import { useAsync } from 'react-async-hook'
import { useClipboard } from 'use-clipboard-copy'

import { getBaseUrl } from '../../utils/getBaseUrl'
import { getExtension } from '../../utils/getFileIcon'
import { getStoredToken } from '../../utils/protectedRouteHandler'

import { DownloadButton } from '../DownloadBtnGtoup'
import { DownloadBtnContainer, PreviewContainer } from './Containers'
import FourOhFour from '../FourOhFour'
import Loading from '../Loading'
import 'plyr-react/plyr.css'

const VideoPlayer: FC<{
  videoName: string
  videoUrl: string
  width?: number
  height?: number
  thumbnail: string
  subtitle: string
  isFlv: boolean
  mpegts: any
}> = ({ videoName, videoUrl, width, height, thumbnail, subtitle, isFlv, mpegts }) => {
  const plyrRef = useRef<APITypes>(null)
  const [audioTracks, setAudioTracks] = useState<string[]>([])
  const [currentTrack, setCurrentTrack] = useState(0)

  useEffect(() => {
    axios
      .get(subtitle, { responseType: 'blob' })
      .then(resp => {
        const track = document.querySelector('track')
        track?.setAttribute('src', URL.createObjectURL(resp.data))
      })
      .catch(() => {
        console.log('Could not load subtitle.')
      })

    if (isFlv) {
      const loadFlv = () => {
        const video = document.getElementById('plyr') as HTMLVideoElement
        const flv = mpegts.createPlayer({ url: videoUrl, type: 'flv' })
        flv.attachMediaElement(video)
        flv.load()
      }
      loadFlv()
    }

    // Check for audio tracks after video loads
    setTimeout(() => {
      const video = document.getElementById('plyr') as any
      if (video?.audioTracks?.length > 0) {
        const tracks: string[] = []
        for (let i = 0; i < video.audioTracks.length; i++) {
          const track = video.audioTracks[i]
          tracks.push(track.label || track.language || `Track ${i + 1}`)
          if (track.enabled) setCurrentTrack(i)
        }
        setAudioTracks(tracks)
      }
    }, 1000)
  }, [videoUrl, isFlv, mpegts, subtitle])

  const switchAudioTrack = (index: number) => {
    const video = document.getElementById('plyr') as any
    if (video?.audioTracks) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = i === index
      }
      setCurrentTrack(index)
      toast.success(`Switched to ${audioTracks[index]}`)
    }
  }

  const plyrSource = {
    type: 'video' as const,
    title: videoName,
    poster: thumbnail,
    sources: isFlv ? [] : [{ src: videoUrl }],
    tracks: [{ kind: 'captions' as const, label: videoName, src: '', default: true }],
  }

  const plyrOptions = {
    ratio: `${width ?? 16}:${height ?? 9}`,
    fullscreen: { iosNative: true },
    settings: ['captions', 'quality', 'speed'],
  }

  return (
    <div>
      <Plyr id="plyr" ref={plyrRef} source={plyrSource} options={plyrOptions} />
      {audioTracks.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
          <span className="text-sm font-medium">🎵 Audio Track:</span>
          <select
            value={currentTrack}
            onChange={e => switchAudioTrack(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
          >
            {audioTracks.map((track, i) => (
              <option key={i} value={i}>
                {track}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

const VideoPreview: FC<{ file: OdFileObject }> = ({ file }) => {
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)
  const clipboard = useClipboard()
  const { t } = useTranslation()

  // OneDrive generates thumbnails for its video files, we pick the thumbnail with the highest resolution
  const thumbnail = `/api/thumbnail/?path=${asPath}&size=large${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We assume subtitle files are beside the video with the same name, only webvtt '.vtt' files are supported
  const vtt = `${asPath.substring(0, asPath.lastIndexOf('.'))}.vtt`
  const subtitle = `/api/raw/?path=${vtt}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  // We also format the raw video file for the in-browser player as well as all other players
  const videoUrl = `/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`

  const isFlv = getExtension(file.name) === 'flv'
  const {
    loading,
    error,
    result: mpegts,
  } = useAsync(async () => {
    if (isFlv) {
      return (await import('mpegts.js')).default
    }
  }, [isFlv])

  return (
    <>
      <PreviewContainer>
        {error ? (
          <FourOhFour errorMsg={error.message} />
        ) : loading && isFlv ? (
          <Loading loadingText={t('Loading FLV extension...')} />
        ) : (
          <VideoPlayer
            videoName={file.name}
            videoUrl={videoUrl}
            width={file.video?.width}
            height={file.video?.height}
            thumbnail={thumbnail}
            subtitle={subtitle}
            isFlv={isFlv}
            mpegts={mpegts}
          />
        )}
      </PreviewContainer>

      <DownloadBtnContainer>
        <div className="flex flex-wrap justify-center gap-2">
          <DownloadButton
            onClickCallback={() => window.open(videoUrl)}
            btnColor="blue"
            btnText={t('Download')}
            btnIcon="file-download"
          />
          <DownloadButton
            onClickCallback={() => {
              clipboard.copy(`${getBaseUrl()}/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`)
              toast.success(t('Copied direct link to clipboard.'))
            }}
            btnColor="pink"
            btnText={t('Copy direct link')}
            btnIcon="copy"
          />
          <DownloadButton
            onClickCallback={() => window.open(`iina://weblink?url=${getBaseUrl()}${videoUrl}`)}
            btnText="IINA"
            btnImage="/players/iina.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`vlc://${getBaseUrl()}${videoUrl}`)}
            btnText="VLC"
            btnImage="/players/vlc.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`potplayer://${getBaseUrl()}${videoUrl}`)}
            btnText="PotPlayer"
            btnImage="/players/potplayer.png"
          />
          <DownloadButton
            onClickCallback={() => window.open(`nplayer-http://${window?.location.hostname ?? ''}${videoUrl}`)}
            btnText="nPlayer"
            btnImage="/players/nplayer.png"
          />
        </div>
      </DownloadBtnContainer>
    </>
  )
}

export default VideoPreview
