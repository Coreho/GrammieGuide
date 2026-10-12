These are original test fixtures: 0.4 seconds of a synthetic 440 Hz tone,
encoded with FFmpeg into MP3, MP4 AAC, ADTS AAC, FLAC, Ogg Vorbis (OGG/OGA),
Ogg Opus, WebM Opus and PCM WAV.
No music recording or copyrighted sample is included. Tags say
"Familiar test song" and "Test artist" wherever the container supports them.
The MP3 includes the tiny original solid-color PNG as cover art.

The checked-in files keep tests independent of FFmpeg installation.
Use `ffmpeg -f lavfi -i sine=frequency=440:duration=0.4` with the appropriate
audio codec and `-metadata title="Familiar test song" -metadata artist="Test artist"`
to regenerate audio. MP3 maps the cover as a second input and marks it
`-disposition:v attached_pic`.
