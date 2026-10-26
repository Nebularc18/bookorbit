# Shelfmark in Book Requests

Shelfmark can search and download for BookOrbit while users stay on the Requests page. BookOrbit copies completed files over Shelfmark's API, inspects them, and imports them through the normal Book Dock workflow. No shared folder or separate BookOrbit download client is required.

## Setup

1. In Shelfmark, configure the sources you want to use and select folder output. Keep completed files available until BookOrbit has imported them.
2. Set `SHELFMARK_API_KEY` in Shelfmark's environment and restart Shelfmark. The key needs an existing Shelfmark admin account. See [Shelfmark API access](https://github.com/calibrain/shelfmark/blob/main/docs/api-access.md).
3. In BookOrbit, open Settings > Server > Requests > Sources, add a source, and choose Shelfmark.
4. Enter the address BookOrbit can reach, such as `http://shelfmark:8084`, and the API key. Enable Allow private addresses for a local or Docker network address. Reverse proxy subpaths are supported; use an address that answers directly without a login-page redirect.
5. Save and test the connection. BookOrbit's `BOOK_REQUEST_ENCRYPTION_KEY` must already be configured to store source credentials. The Shelfmark key grants Shelfmark admin access and stays encrypted on the BookOrbit server.

## Request a download

Approve a request, choose its destination library, and open Find a release. Shelfmark results appear alongside your other configured sources. Choose Download with Shelfmark to queue a release. Normal request and self-fulfil permissions still apply.

Progress includes Shelfmark's download followed by copying the file into BookOrbit. Multi-file downloads are transferred as a ZIP and use BookOrbit's archive inspection. The existing verification and review settings decide whether the book is filed automatically or waits for review. Only after a successful import does the request become available.

Cancelling stops the matching active Shelfmark job and removes BookOrbit's staged copy. Import cleanup removes only BookOrbit's copy. It does not delete Shelfmark's original files or stop a torrent seeding there.

BookOrbit resumes polling saved Shelfmark attempts after its own restart. An interrupted copy restarts from the completed Shelfmark file. Do not dismiss or remove that file in Shelfmark while BookOrbit is still working on it. An existing active job started outside BookOrbit is refused to avoid taking ownership of somebody else's download; a matching completed file can be reused.

Release searches allow 330 seconds because Shelfmark searches enabled sources sequentially and its default search budget is 300 seconds. Status checks and download submissions retain their 30-second API timeout. The first search may take longer while Shelfmark clears a source protection challenge.
