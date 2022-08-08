# ReplayOverlay
This script can be used to generate an overlay on a [ReplayMod](https://www.replaymod.com) video, using data from the replay itself. Currently it is made specifically for the [Entrapment Fan Tournament](https://www.youtube.com/playlist?list=PLoNdUvAbWkKbYI_wgEmSgMZHbsLeN0EWt), a YouTube series of mine, but I may make this script more versatile in the future. Meanwhile, you can also tinker around with the code to make it work for you (although it would be nice if you credit me if you use this tool).

If there are any mistakes in the code or in this explanation please let me know.

## Prerequisites
This progam uses the ReplayMod (obviously) as well as [FFmpeg](https://ffmpeg.org) and [NodeJS](https://nodejs.org/); install all those before using this tool. You will also need to make available two files: a font file and a overlay background.

For the Entrapment Fan Tournament, the font [Minecraftia Regular](https://www.dafont.com/Minecraftia.font) was used. Download the font file, rename it `font.ttf` and move it into the same directory as where this program is.

The overlay background is already included in this repository: `background.png`. Note that the size of the overlay, 1323x270 pixels, is hardcoded and made for a 4K resolution video. This tool will draw everything automatically onto the scoreboard, *except* for the faces of the players; you will need to do that manually.

## Usage
Using ReplayOverlay is currently fairly complicated. Firstly, the tool consists of two scripts:

1. `getreplaydata.js`, which is used to extract useful data from the replay file. It only needs to be run once per ReplayMod recording.
2. `generateoverlay.js`, which uses that data to generate an FFmpeg command to create the overlay on individual videos.

### `getreplaydata.js`
1. Find the Replay file on your computer (in `.minecraft/replay_recordings/`).
2. Open it as a ZIP archive, either by changing the file extension to `.zip` or by using a program like 7Zip.
3. Extract the file `recording.tmcpr` into your working directory.
4. Open command prompt in the same directory and run `node getreplaydata.js`. It will create a `replaydata.json` file in the same directory.
5. Open that file, as you will need to add some data manually about the teams participating in the game. Add `"home"` and `"away"` properties for the top-level objects. It should look something like the example snippet below.
6. You may need to modify the data to be sensible. For example, after somebody dies in Entrapment their health jumps back to 20 again due to respawning as spectator, but this is of course not what you want to show in the video. So in the `"healths"` object, remove any data points after someone's health reached 0.
7. Make sure you close the ZIP archive before opening it in the ReplayMod again, as otherwise this could cause the game to crash.

```json
{
	"home": {
		"name": "The Stroopwafels",
		"colour": "#AA0000",
		"shadow": "#2A0000",
		"players": [
			"MineCrp",
			"vegguid",
			"veghelgumi"
		]
	},
```

### `generateoverlay.js`
This program can be used in two ways: using FFmpeg to add the overlay after the video is rendered in the ReplayMod (the `command` option), or by putting the FFmpeg command into a render queue and adding the overlay *while* rendering in the ReplayMod (the `queue` option).

For the `command` option:
1. Render the video in the ReplayMod.
2. Exit the replay.
3. Following the same steps as for the `recording.tmcpr` file, extract the `timelines.json` file from the Replay file into your working directory (where also the `replaydata.json` file is).
4. Open command prompt in that directory and run `node generateoverlay.js command <name>`, replacing `<name>` with the name of the camera path you rendered. You can also leave the name blank if it is the camera path that was still on the timeline when you exited the replay.
5. The script created a `result.txt` file containing the FFmpeg command. Copy that command.
6. Rename the replay video to `input.mp4`.
7. In the same directory as the video, run the FFmpeg command. This creates an `output.mp4` file which is your result.
8. Make sure you close the ZIP archive before opening it in the ReplayMod again, as otherwise this could cause the game to crash.

For the `queue` option:
1. In the ReplayMod, add all camera paths for which you want to generate an overlay to the render queue.
2. Exit the replay.
3. Following the same steps as for the `recording.tmcpr` file, extract the `renderQueue.json` file from the Replay file into your working directory (where also the `replaydata.json` file is).
4. Open command prompt in that directory and run `node generateoverlay.js queue`.
5. The script created a `result.json` file. Rename this to `renderQueue.json` and move it back into the Replay file, replacing the render queue that was there.
6. Close the ZIP archive before opening it in the ReplayMod again, as otherwise this could cause the game to crash.
7. In the ReplayMod, render all.
