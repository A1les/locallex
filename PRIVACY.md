# LocalLex Privacy Policy

LocalLex is an offline English-Chinese dictionary extension.

## Data collection

LocalLex does not collect, upload, sell, or share user data.

The extension does not call online translation services, AI APIs, analytics services, or remote scripts. Dictionary lookup happens locally in the browser.

## Local data

LocalLex stores the following data locally in the user's browser:

- Dictionary data imported into IndexedDB
- Favorites / vocabulary list
- Lookup statistics
- Theme and display settings

This data stays on the user's device and is not transmitted by LocalLex.

## Permissions

LocalLex requests browser permissions only for local extension features:

- `storage`: store settings and local metadata
- `contextMenus`: provide right-click lookup
- `tabs` and `scripting`: prepare the current page for lookup interaction
- `<all_urls>` host access: support double-click and selection lookup on normal webpages

## Network

The extension runtime is designed to work offline. Build scripts may download dictionary or example source files during development, but the installed extension does not need network access for lookup.

