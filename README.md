
<div align="center">

# 📱 Enterprise Story Streamer

**A high-performance, zero-dependency vanilla JavaScript media player that brings seamless social media-style "Stories" to the web.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)]()
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)]()
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)]()

</div>

---

## 📸 See it in Action

> **[ Placeholder: Insert a high-quality GIF or Screenshot here demonstrating the media transitions, dynamic background, and progress bar ]**
> 
> *Example format: `![Demo](assets/demo.gif)`*

---

## ✨ Key Features & Unique Selling Points

Built with strict performance mandates, the Enterprise Story Streamer bypasses heavy frameworks to deliver native-feeling media consumption directly in the browser. 

* **High-Performance Rendering:** Utilizes GPU-accelerated CSS (`transform: scaleX()`, `will-change`) for buttery-smooth progress bars without layout thrashing.
* **Aggressive VRAM Management:** Features a custom "Nuclear GC" (Garbage Collection) system that proactively purges unused video/image nodes from the DOM to prevent memory leaks during long sessions.
* **Immersive Viewing Experience:** Automatically generates a dynamic, blurred, and slightly scaled background layer matching the active media to fill the viewport seamlessly.
* **Mixed Media Virtualization:** Flawlessly transitions between images and videos with preloading logic, handling asynchronous autoplay policies elegantly.
* **Robust Keyboard Navigation:** Includes a dedicated command router with edge-case protection (ignores typing in text inputs) and scroll prevention.

---

## 🛠 Tech Stack

This project requires **zero build tools** and **zero external dependencies**. 

* **Logic:** Vanilla JavaScript (ES6+)
* **Structure:** HTML5
* **Styling:** CSS3 (CSS Variables, Flexbox, GPU Compositing)

---

## 🚀 Installation & Setup

Because this is a zero-dependency project, setup takes less than 10 seconds.

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Ahmed-Jedidi/LiveStream.git](https://github.com/Ahmed-Jedidi/LiveStream.git)
````
````
2.  **Navigate to the directory:**
    ```bash
    cd enterprise-story-streamer
    ```
3.  **Run it:**
    Simply double-click `index.html` to open it in your browser. Alternatively, use a local development server for the best experience:
    ```bash
    npx serve .
    # OR
    python3 -m http.server
    ```

-----

## 🕹 Usage & Controls

The streamer is designed to be intuitive via click/tap zones and highly accessible via keyboard.

### Data Injection

To modify the media feed, simply update the `MASTER_FEED` array in `index.html`:

```javascript
const MASTER_FEED = [
  { type: "video", src: "path/to/video.mp4", duration: 15 },
  { type: "image", src: "path/to/image.jpg", duration: 5 } // Duration in seconds
];
```

### Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `ArrowRight` | Next Story |
| `ArrowLeft` | Previous Story |
| `ArrowUp` | Volume Up (+10%) |
| `ArrowDown` | Volume Down (-10%) |
| `Enter` | Play / Pause |
| `Space` or `*` | Toggle UI Visibility |
| `#` | Toggle Mute |

-----

## 🗺 Roadmap

  - [ ] **Mobile Touch Support:** Implement horizontal swipe gestures for navigation and tap-and-hold to pause.
  - [ ] **Dynamic API Fetching:** Replace the static `MASTER_FEED` with a `fetch()` wrapper to pull stories from a REST/GraphQL endpoint.
  - [ ] **Accessibility (a11y):** Add proper ARIA labels and screen-reader support for visually impaired users.
  - [ ] **Customizable UI Themes:** Expose CSS variables for easily skinning the progress bars and control icons.

-----

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

*For more detailed instructions, please read our [CONTRIBUTING.md](https://www.google.com/search?q=CONTRIBUTING.md).*

-----

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

```

---

Ahmed-Jedidi ```
