# Ghost Protocol film verification

Nicholas approved the finished **Neon Run** film. The native 4K master, `ghost-protocol-linkedin-neon-run-4k.mp4`, is preserved in the local production archive. The [GitHub player](https://github.com/user-attachments/assets/9fee1618-74fd-45c8-a706-ba4363241e89) uses a 1080p viewing copy with the same approved AAC audio stream.

## Revised film: Neon Run

The film is 80.2 seconds long. Its H.264 video stream is byte-identical to the preserved original: 3840 by 2160, twenty-five frames per second, and 2,005 frames, with the original Rec.709 metadata. The remix replaces the audio without re-encoding, enlarging or rearranging the video. Full audio and video decode passed, and fast-start was verified. The export is 44,152,316 bytes.

The fourteen-second introduction still explains the digital-key scenario before actual gameplay. The edit selects Mission One, Mission Four and the defender result from real keyboard and interface actions. Gameplay remains presented at eighty-five percent speed; the separately captured defender segment retains its original rate. The soundtrack plays at its normal 124 beats per minute throughout the introduction, gameplay and ending. The gameplay slowdown was not applied to the music.

The decoded stereo audio is AAC at 48 kHz. Integrated loudness measured minus 17.06 loudness units relative to full scale, or LUFS, with a true peak of minus 1.50 dBTP. Important action cues receive a four-decibel dip in the background music so they have room in the mix.

The gameplay effects were resynthesized from the original sound recipes and recorded action and state observations. Their onsets are inferred from those observations and mapped into the edit. They are not sample-exact extracts of the original gameplay effects track. Actual defender audio is retained. The pictures, actions and outcomes are unchanged; this limitation concerns reconstructed effect timing and sound matching.

The [sanitized Neon Run receipt](neon-run-verification.json) records file hashes, stream equality, dimensions, duration, loudness, loop properties and the effect-timing limit. It contains no absolute personal paths or session data. The revised film, original film and game-loop hashes were checked against the raw production receipts when this summary was prepared.

## Game music revision

Neon Run is an original procedural synthesizer composition with no external samples. The game version is a sixteen-bar MP3 loop at 124 beats per minute, about 30.97 seconds long. Notes and echoes crossing the boundary wrap into its beginning; no boundary silence is inserted. The browser decodes and loops that rendered track, while the movement and action sounds remain separately synthesized and controlled.

The later local Neon Run revision passed 103 automated tests and the five-mission campaign. That result is separate from the historical 96-test Render gameplay release. The new music is now deployed on Render at source `ea3382bed3e7cac6a341bbc2ccb5d54207442f62`. A real public browser verified the exact new bundle and music-file hash, active playback, keyboard movement, original Vault-key collection sound and resumed music with zero errors. See the [public receipt](../neon-run-review/public/public-smoke.json), [technical guide](../../docs/TECHNICAL_GUIDE.md) and [hosting record](../../docs/HOSTING.md).

Local audio verification measured a complete loop, one download/source, silence while paused or muted, saved settings after reload and the original interaction effect. Actual hidden-tab behavior remains untested because the automation environment kept both pages visible.

## Preserved original film

The earlier original-score film, `ghost-protocol-linkedin-4k.mp4`, is preserved unchanged in the local production archive. Its [original technical receipt](video-qa-receipt.json) applies to the earlier mix and retains its own measured loudness, file hash and historical release status. It must not be used as the audio receipt for the Neon Run revision.

The original native 4K capture used the approved e3ad76c game. Its source run completed all five missions with enemies active, revoked-gate denials and Transit preserved. The defender interface was captured separately at native 4K with a larger browser interface for readability. No gameplay was enlarged from a smaller recording. These were guided verification routes, not evidence of a newcomer's playtime or learning.

The existing [poster](ghost-protocol-poster.png), [Vault frame](ghost-protocol-gate-caption.png), [Transit frame](ghost-protocol-transit-caption.png) and [captions](ghost-protocol-linkedin.srt) still correspond to the unchanged video. The contact sheet remains in the local production archive. The original frame and layout review remains applicable to those pictures.

## Printed play address

The Sites hostname printed in the film was verified to return an HTTP 302 redirect to [the Render game](https://ghost-protocol-b74p.onrender.com/). This was the version-five redirect deployment, replacing the older preview at that address. The printed ending can therefore lead viewers to the accepted playable host without changing the video stream.

The full public campaign and idle-start measurements in [the hosting record](../../docs/HOSTING.md) apply to the earlier `fa78de9` runtime. The later Neon Run public check covers the deployed music and controls; those broader measurements were not repeated for the music revision.
