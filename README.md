# YTC Fetcher

Youtube Video Comments Fetcher with Auto Update via Youtube Data API v3.

It allows to read new comments quicker and easier without loading the video,
switching sorting order, skipping recommended section and other heavy stuff.

It's a client-side app with a couple **requirements**:
* Youtube Data API Key, since they have usage quotas there is no build-in.
* Any HTTP server, since GAPI does not work with "file://" origin.
* Browser support for ES6 (ECMAScript 2015).

## What it can do

1. Fetch comments for
  * video by its id;
  * last video by channel id;
  * last video by channel username.
2. Load up to 100 top-level comments with 100 replies for each (GAPI limits).
3. Autoload new comments every number of seconds
(keep in mind the daily request quota for API key with frequent and large updates, generally the default settings are with a good margin for personal use).
4. Highlight author and his top-level comments.
5. Highlight recent comments.
6. Use GET params to access comment feeds later or share them.
7. Remember the last request params in the browser
(for instance autofill API key).

### Known Issues

Blank page with a javascript error:

```js
Failed to execute 'postMessage' on 'DOMWindow': The target origin provided ('file://') does not match the recipient window's origin ('null').
```

It happens because of the browser "same origin policy",
when index.html is opened locally, not via HTTP server.
An async-post-messaging error is not catchable in the caller script.
