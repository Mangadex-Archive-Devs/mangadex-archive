# mangadex-archive

A nodejs based bot that periodically scans for completed manga on mangadex, which are then packed inside a torrent and uploaded to anidex

**Do not browse Mangadex while this is running**

## Testmode

To run in testmode, use flags `--no-db --no-images --no-upload`. this will still generate the folders and info.txt files (BASE_DIR must exist), but no torrents,
no image downloads, no db writes and no upload.

### Collaborators
Thanks to everyone who participated in this project
* https://github.com/radonthetyrant
* https://github.com/xicelord
* https://github.com/ZaneHannanAU
* https://github.com/AviKav
