# Client Web Booth 

A self-hosted, browser-based photobooth application.

Unlike traditional photobooth software that relies on a single high-end camera connected to the server, **Client Web Booth** serves a web app to client devices (smartphones, tablets) connected via WiFi/LAN. Users take photos using their own cameras, but the high-resolution images are processed and uploaded to your central server.

> [!WARNING]
> **SECURITY NOTICE: NOT FOR PERMANENT OR PUBLIC INSTALLATION**
>
> This application was built for temporary, private events (like parties or weddings) on a secured local network.
> * **No Authentication:** Anyone with access to the URL can upload images and view the gallery.
> * **No Input Sanitization:** While basic checks exist, it is not hardened against malicious file uploads.
> * **Ephemeral Use Only:** Do not run this on a public-facing server or leave it running permanently on your network.
>
> **Use at your own risk.** Ensure it is run behind a firewall and only accessible to trusted guests.

## 💡 Motivation

I wanted to set up a photobooth where clients could connect via WiFi or LAN and take pictures, but I needed the photos to remain on my server rather than just staying on their phones.

I looked for existing self-hosted solutions, but almost all of them were designed to use the server's webcam (like a traditional booth). I couldn't find anything that leveraged the client's webcam while centralizing the storage. So, I built this quickly to fill that gap.

## 🌟 Features

* **Client-Side Capture:** Uses the high-quality rear or front cameras of user devices (iOS/Android supported on chromium based browsers).
* **Centralized Storage:** All photos are automatically uploaded and saved to the host server.
* **Live Gallery:** Users can view a shared gallery of photos taken during the session.
* **Overlays & Filters:** Supports applying transparent PNG overlays (frames, branding) to photos.
* **Multi-Language Support:** Includes English, Spanish, French, Quebecois, German, and Japanese.
* **Privacy Focused:** No external cloud dependencies; runs entirely on your local network (dependant on some statis assets on the web).

## Architecture & Topology

The system consists of a Node.js backend and a static frontend, typically served behind Nginx for SSL termination (required for camera access).

1.  The **Host** runs Node.js to handle uploads and Nginx to serve the site.
2.  The **Client** connects to the Host's IP address.
3.  The **Capture** happens in the client's browser (using HTML5 `getUserMedia`).
4.  The **Upload** sends the image data back to the Host immediately.

## Installation & Setup

### Prerequisites
* Node.js (v14+ recommended)
* Nginx (for serving the frontend and handling SSL)
* SSL Certificates (Self-signed or via Let's Encrypt). *Note: Modern browsers block camera access on non-secure (HTTP) connections unless using localhost.*

### 1. Backend Setup

Clone the repo and install dependencies:

```bash
git clone (this repo)
cd client-web-booth
npm install
```

Start the backend server:

```bash
# Runs on port 3000 by default
npm start
```

### 2. Frontend & Nginx Setup

You need to configure Nginx to serve the frontend files (HTML/CSS/JS) and proxy the API calls to the Node.js application.

1.  Move your frontend files (`index.html`, `app.js`, `style.css`, etc.) to your web root (e.g., `/var/www/html`).
2.  Use the provided `default` nginx config file as a template.
3.  Ensure your SSL certificates are generated and paths are correct in the config.

**Key Nginx Configuration Blocks:**

```nginx
server {
    listen 443 ssl;
    server_name 192.168.X.X; # Your LAN IP

    # SSL Config...
    
    root /var/www/html; # Path to frontend files

    # Proxy API requests to Node.js
    location /upload {
        proxy_pass [http://127.0.0.1:3000/upload](http://127.0.0.1:3000/upload);
        client_max_body_size 50M; # Allow large images
    }
    
    location /gallery-data {
        proxy_pass [http://127.0.0.1:3000/gallery-data](http://127.0.0.1:3000/gallery-data);
    }

    # ... see 'default' file for full config
}
```

## Project Structure

```text
client-web-booth/
├── overlays/                  #  Store PNG frames/filters here
├── uploads/                   #  Captured photos are saved here
│   └── thumbnails/            #  Generated low-res thumbnails
├── app.js                     #  Frontend logic (Camera, Canvas, Uploads)
├── default                    #  Nginx configuration reference
├── index.html                 #  Main application page
├── index-style.css            #  Stylesheet
├── package.json               #  Node dependencies & scripts
├── server.js                  #  Express.js backend server
└── translations.js            #  UI Localization (EN, ES, FR, DE, JA)
```

## Todo & Roadmap

- [ ] Docker Support: Containerize the application (Node + Nginx) for one-click deployment.
- [ ] Add an admin panel to delete photos from the gallery.
- [ ] Add option to download all photos as a ZIP.
- [ ] Make the app completely offline by downloading dependencies on the server on setup

## Contributing

This was built quickly to solve a specific need. Feel free to open issues or PRs if you want to improve or add features!