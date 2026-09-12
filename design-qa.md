# MELODIK — design and interaction QA

final result: passed

## Scope and visual truth

Source: `reference/frame-00.jpg`, `reference/frame-01.jpg`, `reference/frame-04.jpg`, `reference/frame-06.jpg`, `reference/gallery-top.jpg`, extracted from the user's 175-second video.

The user explicitly authorized a non-pixel-perfect refinement and removal of unnecessary features. The accepted interpretation keeps the cream/berry/lavender palette, rounded typography, vinyl player, mood tabs, track list and scrapbook imagery. Left-aligned heading, Vietnamese copy, search/favorites, compact playlist sleeves and a separate admin interface are intentional adaptations. Newsletter, promotional articles and timeline were deliberately omitted.

## Evidence and normalization

- Final desktop: `reference/desktop-viewport.png`, browser-rendered at 1110 × 960 CSS pixels, reported device scale approximately 1; host capture is 1095 × 947 pixels.
- Source: 1110 × 720 pixels including browser chrome. Crop y=89…720 removes source browser chrome.
- `reference/comparison-desktop.jpg` combines source and final viewport in one image. Implementation is normalized to 1110 × 960, then the first 631 pixels are compared with source page content. Layout differences are assessed against the authorized adaptation, not a pixel-error score.
- `reference/comparison-record.jpg` compares the record artwork and player surfaces at component scale.
- Mobile evidence: `reference/implementation-mobile.png`, `reference/implementation-320.png`, `reference/gallery-mobile.png`, `reference/admin-mobile.png`; additional viewport screenshots were visually inspected inline at 390 × 844 and 320 × 740.
- Earlier `reference/implementation-desktop.png` is **not used for final QA**: the browser's stitched full-page screenshot duplicated part of the shelf. This was a capture artifact, not duplicated DOM content. Final review uses an unstitched viewport capture.
- State: first Lo-Fi Café track selected, paused, search cleared. Demo artist and duration differ intentionally because the audio is synthesized locally.

## Findings and comparison history

1. [P2, resolved] At 320 CSS pixels, intrinsic grid minimum widths caused the player and track panel to reach 338 pixels. Added `min-width: 0` to both panels and `minmax(0, 1fr)` to the mobile grid. Rechecked: viewport 320, document scroll width 320. Post-fix evidence: `reference/implementation-320.png` and browser measurement.
2. [P2, resolved] Tight mobile playback controls had insufficient targets. Increased secondary control widths to 30 pixels and heights to 34 pixels; at 320 pixels the record player stacks vertically to keep controls separate. Verified 390-pixel viewport screenshot and 320-pixel layout. Form inputs use 16px text on mobile.
3. [P2, resolved] Reference image crops included small UI labels and a cursor over the tea image. Recropped the night/desk photos and used a clean tea/book region from another supplied frame. Final shelf image crops contain only source artwork.
4. [P3, remaining] Source-video imagery has limited resolution. It is suitable for the small preview cards, but client-owned full-resolution artwork would improve the final published gallery. All images load; no placeholders or invented image URLs are used.

## Required fidelity surfaces

- Typography: local Quicksand headings and Nunito body text maintain rounded, informal source character; Vietnamese glyphs load correctly. Source heading family is inferred from appearance, not identified as an exact match. No observed overlapping text; track titles truncate deliberately while accessible names retain the complete title.
- Spacing/layout: two-column listening surface on desktop; compact record/controls and then library on mobile, with a stacked player at the narrowest breakpoint. Rounded paper surfaces, fine borders and small offset shadows carry through pages. The enlarged track panel deliberately accommodates search and favorite controls. No horizontal overflow after the 320px fix.
- Colors/tokens: cream #faf8f2, dark plum #362e3b, berry #c33c77 and pale lavender #e9e0f0 reflect the source. Selected/playing states use berry; content text is darker than secondary metadata. Full automated WCAG certification was not performed.
- Image quality: actual raster artwork extracted from the supplied video, with sensible aspect-ratio cropping; original source limitations noted above. Phosphor supplies functional icons. No substitute hand-drawn CSS/SVG artwork.
- Copy/content: Vietnamese listening and admin flows; real synthesized demo audio is labeled as demo content. No fake subscriber counts, marketing promises or nonfunctional external social links.

## Interaction verification

Browser tests used an isolated database and existing test account on port 4001; the user's real database remains without a pre-created admin account.

- Sign in through the rendered admin form, open track editor, upload a real WAV through the file chooser, save and see the library count increase from 12 to 13.
- Play the uploaded track: browser media element reports `paused: false`, duration 36 and the new `/media/...wav` source.
- Reload and verify the uploaded track remains; favorite selection survives reload on the same device.
- Navigate during playback to gallery: audio continues and time advances; category filter returns the two travel photos; open/close the Forest Walk detail dialog.
- Submit a guestbook message, observe success, navigate to admin and read the private message.
- Test no-result music search and clear via its visible control.
- Test repeat by seeking to the end; elapsed time resets while the same track continues.
- Public setup screen is present at `/admin`; no default password or real account was created by the agent.
- Browser console logs checked: no error or warning entries in the tested application flows.
- API integration tests pass: auth restrictions, setup/login/logout, same-origin rejection, file-signature rejection, upload, 206 byte-range audio, CRUD, private messages, reopening persistent data and preserving an intentionally emptied library without reseeding.
- Production build passes.

## Limits

Responsive checks used desktop Chromium viewports, not physical iOS/Android devices. WAV upload/playback was exercised end-to-end; other advertised audio containers depend on browser codec support. No public deployment or outbound email delivery was performed.

## Implementation checklist

- [x] Match the accepted visual direction and inspect desktop/mobile output.
- [x] Resolve P0/P1/P2 findings and recheck narrow-screen overflow.
- [x] Exercise the main upload-to-listen workflow and durable storage.
- [x] Leave the first real admin account for the user to configure.
- [x] Provide local preview and setup/backup documentation.
