# nodejs-yt2mp4-cli

## Feature
- Convert youtube url to mp4 in cli
- no playlist url
- ```-one```: Combine multiple video files into one file

## Requirements
- OS : Windows
- [PATH - ffmpeg.exe](https://github.com/BtbN/FFmpeg-Builds)
- [PATH - yt-dlp.exe](https://github.com/yt-dlp/yt-dlp)

## Usage
- ```yt2mp4 [-one] <ARG> [<ARG> ...]```
- ```<ARG> = URL or "{\"title\":\"<FileName>\",\"url\":\"<URL>\",\"start\":<SEC>,\"end\":<SEC>}"```