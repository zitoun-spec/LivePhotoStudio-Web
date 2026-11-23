# Live Photo Studio

Zet een video lokaal om in een Apple Live Photo-bestandspaar. De studio maakt een JPEG van het gekozen hoofdframe en een gekoppelde QuickTime MOV met de volledige videotijdlijn en de eerste beschikbare audiotrack. De webapp biedt een afspeelbare simulatie en downloads als losse bestanden of ZIP.

**Apple Foto’s op een fysieke iPhone is nog niet gevalideerd.** Apple documenteert een native PhotoKit-import voor twee gekoppelde bronnen. Het is onbekend welke lengtes Foto’s op jouw iPhone als één Live Photo accepteert en afspeelt. [Apple Photos en PhotoKit](https://developer.apple.com/documentation/avfoundation/capturing-and-saving-live-photos)

## Gebruiken

1. Open de website in Safari en kies **Import Video**. Selecteer een video uit Foto’s of Bestanden. Gebruik **Bestanden** voor de originele bytes als de Fotokiezer een aangepaste kopie aanbiedt.
2. Controleer de duur, resolutie, beeldverhouding en beschikbaarheid van geluid. Met de schuifregelaar **Key photo** kies je het hoofdframe. De beginsuggestie ligt halverwege de video.
3. Tik op **Convert to Live Photo**. **Use Full Video** staat aan. De studio heeft geen duurgrens, knipt de video niet en toont een fout als de behoudscontroles mislukken.
4. Houd het resultaat ingedrukt om het vanaf het begin af te spelen. De afspeelknop start de hele simulatie met geluid als een audiotrack beschikbaar is.
5. Kies **Prepare ZIP** en vervolgens **Download ZIP**, of download de JPEG, MOV en oorspronkelijke video afzonderlijk. Onder iOS kan **Share files** beschikbaar zijn. De deelbestemming bepaalt hoe de bestanden worden verwerkt.

### Opslaan via iPhone

De browser heeft toegang tot downloads en de deelinterface. Voor het schrijven van één Live Photo naar de systeemfotobibliotheek gebruikt een native iOS-app PhotoKit met één `PHAssetCreationRequest` en twee bronnen, `.photo` en `.pairedVideo`. LivePhotosKit JS dient voor weergave op het web. Voor iOS Opdrachten is geen gedocumenteerde actie gevonden die een willekeurig JPEG/MOV-paar met deze twee PhotoKit-brontypen importeert. [Apple PhotoKit](https://developer.apple.com/documentation/photos/phassetcreationrequest), [LivePhotosKit JS](https://developer.apple.com/documentation/livephotoskitjs)

Om de import op je eigen iPhone te proberen zonder Mac of Xcode:

1. Download de ZIP en open deze in **Bestanden**. Tik op het archief om het uit te pakken. Houd de namen gelijk, bijvoorbeeld `Video - Live.jpg` en `Video - Live.mov`.
2. Gebruik één import in een iPhone-app die bestaande Live Photo-paren ondersteunt. HashPhotos documenteert bestandsimport via **Add → Import Files…** en het koppelen van de JPEG en MOV in de externe bibliotheek. Probeer beide bestanden in dezelfde import te selecteren in een album van de systeembibliotheek. De studio-uitvoer is nog niet met HashPhotos getest. Bestandsimport kan onder een proef- of Pro-limiet vallen. [HashPhotos-bestandsimport](https://www.hashphotos.app/guides/feature/transfer/import/files/), [HashPhotos-releaseopmerkingen](https://www.hashphotos.app/releasenotes/)
3. Open **Foto’s** en controleer of er één item met de aanduiding **LIVE** is verschenen. Houd de foto ingedrukt en controleer de volledige beweging en het geluid. Als Foto’s de bestanden los toont, is de import als Live Photo niet gelukt. De volledige MOV blijft als video bruikbaar.

### Installeren en offline

Tik in Safari op **Deel → Zet op beginscherm**. De webapp gebruikt een eigen manifest, appiconen, een venster in standalone-modus en opstartschermen voor ondersteunde iPhone-schermen. Na het eerste online bezoek kan de app-shell offline openen. Na een succesvolle online conversie kan de serviceworker ook de videokern hergebruiken, zolang Safari die cache bewaart. Bij verbindingsproblemen blijft het origineel beschikbaar in de huidige sessie. Gebruik Safari als het delen of downloaden vanuit standalone-modus afwijkt.

## Technische keuzes

- **Verwerking.** React, TypeScript, Vite en Tailwind CSS vormen de interface. De single-threaded FFmpeg WebAssembly-core draait in een worker en vereist geen `SharedArrayBuffer` of aangepaste GitHub Pages-headers. Voor afspeelbare MOV-bestanden met één geschikte videotrack en hoogstens één AAC-audiotrack kan de studio het paar rechtstreeks samenstellen via Blob-slices. Dat pad heeft geen WebAssembly-core nodig. Anders leest WORKERFS de bron via een Blob. Annuleren beëindigt de worker, inclusief de tijdelijke bestanden in zijn geheugen. [FFmpeg WebAssembly](https://ffmpegwasm.netlify.app/docs/overview/)
- **Tijdlijn en kwaliteit.** FFmpeg kopieert H.264 en op het toestel afspeelbare HEVC, plus AAC wanneer aanwezig. Andere codecs worden zo nodig omgezet naar H.264 en AAC, met passthrough van de videotimestamps. Autorotatie volgt de bron en bij oneven afmetingen kan één randpixel worden toegevoegd voor 4:2:0-encoding. HDR-uitvoer bij hercodering kan afwijken. De app vergelijkt duur, aanwezige frames en audio voordat hij het resultaat aanbiedt.
- **Hoofdfoto.** Canvas encodeert de gekozen framepositie als JPEG. FFmpeg biedt een fallback voor browserdecodering. Het EXIF APP1-segment gebruikt Apple MakerNote-tag 17 met een hoofdletter-UUID. Exifr leest de MakerNote terug voor de validatie. [ExifTool Apple-tags](https://exiftool.org/TagNames/Apple.html), [AVFoundation-voorbeeld met MakerApple 17](https://github.com/Hiwoniu/live-photos)
- **MOV.** Een filmniveau-`mdta`-item bevat `com.apple.quicktime.content.identifier`. Een `mebx`-track bevat een getypeerd `com.apple.quicktime.still-image-time`-sample gekoppeld aan de videotrack. Een edit list plaatst het sample op de gekozen positie, in de tijdschaal van de film. De writer houdt de bestaande audiovideo-chunk-offsets intact. De structuur is vergeleken met een AVFoundation-voorbeeld. [Apple QuickTime timed metadata](https://developer.apple.com/documentation/quicktime-file-format/timed_metadata_sample_descriptions), [LimitPoint AVFoundation-voorbeeld](https://github.com/LimitPoint/LivePhoto)
- **Preview.** De browser speelt de volledige geconverteerde MOV via HTML5 Video en toont eerst de JPEG. Die simulatie kan de weergave in Apple Foto’s niet vaststellen.
- **Geheugen en privacy.** De app verstuurt geen media en gebruikt geen trackers. De invoer, uitvoer en tijdelijke links blijven in deze sessie. Het uitvoerbestand gebruikt ruimte in werkgeheugen en kopieerbuffers. De harde WebAssembly-bestandsgrens is 2 GB. Op iPhones kunnen resolutie, codec en beschikbaar geheugen het maximum eerder bepalen. Bij geheugentekort kun je hetzelfde originele bestand proberen op een desktopbrowser. Er is geen tijdslimiet voor de bronvideo. [FFmpeg WebAssembly FAQ](https://ffmpegwasm.netlify.app/docs/faq/)
- **Licenties.** De gedistribueerde FFmpeg-core is `@ffmpeg/core@0.12.10`. De bron, bouwscripts en licentie-informatie zijn beschikbaar bij het upstreamproject. Het voorbeeldbeeld is gegenereerd voor deze studio. [FFmpeg.wasm 0.12.10](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10), [FFmpeg-licentie](https://ffmpeg.org/legal.html)

## Ontwikkelen

Vereist Node.js 24 of hoger. Voor de tests zijn native `ffmpeg` en `ffprobe` nodig, bij voorkeur FFmpeg 6.1 of hoger.

```sh
npm ci
npm run dev
```

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Gebruik eventueel `LIVE_PHOTO_CHROMIUM=/pad/naar/chromium` om een systeemversie te testen. Voor de optionele WebKit-suite installeer je WebKit met `npx playwright install --with-deps webkit` en gebruik je `LIVE_PHOTO_WEBKIT=1 npm run test:browser -- --project=webkit`. Linux WebKit is een browsertest, fysieke iPhone-ondersteuning vraagt een aparte test.

## GitHub Pages

Selecteer in GitHub **Settings → Pages → Build and deployment → Source → GitHub Actions**. De workflow draait typecontrole, lint, tests en de productiebuild bij pull requests en pushes naar `main`. Na een geslaagde build op `main` publiceert hij `dist/` via GitHub Pages. Gebruik zo nodig **Run workflow** na het instellen van de bron. De relatieve Vite-basis houdt de site, assets, serviceworker en WebAssembly onder het repositorypad. [GitHub Pages-publicatiebron](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Verificatie

| Controle | Methode |
| --- | --- |
| Duur 3, 10, 30, 60 en 120 seconden, inclusief frameaantal en AAC | Uitvoertests met FFmpeg, FFprobe en Playwright |
| Apple MakerNote, gedeelde UUID, type en timestamp van het metadata-sample | Exifr, QuickTime-parser en onafhankelijke FFprobe-demuxer |
| iPhone-weergave, bestandskiezer, selectie, foutafhandeling, annuleren, opnieuw proberen, beweging, ZIP en losse downloads | Playwright op de productiebuild onder het GitHub Pages-repositorypad |
| Volledige lengte in Apple Foto’s en geluid, vooral bij 30, 60 en 120 seconden | Nog te controleren op een fysieke iPhone |

Voor die laatste controle gebruik je dezelfde testlengtes op een iPhone met Safari en in standalone-modus. Controleer import uit Foto’s en Bestanden, portret-HEVC, het exacte hoofdframe, iPhone-delen en of één item in Apple Foto’s de volledige beweging met geluid afspeelt. Noteer iOS-versie, duur en eventuele foutmelding per geval.
