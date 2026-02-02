# Demo Guide

## Overview

The Unified AI Toolbox provides two interactive demos to showcase the platform's capabilities:

1. **Orchestration Simulation Demo** (`demo-orchestration-sim.html`) - Watch a real orchestration run with agents collaborating to build a Task Management API
2. **Animated Overview Demo** (`demo-animated.html`) - Visual journey through the platform's features and capabilities

---

## Orchestration Simulation Demo

### What It Shows

The Orchestration Simulation Demo provides a realistic simulation of an actual orchestration run, showing how multiple AI agents collaborate to build a production-ready Task Management API.

**Live Demo:** [demo-orchestration-sim.html](../demo-orchestration-sim.html)

### Features

#### 🎯 Realistic Goal

Watch agents work on a real-world project:
> "Build a RESTful Task Management API with user authentication, CRUD operations for tasks, data persistence using SQLite, comprehensive unit tests, API documentation, and deployment instructions for both development and production environments."

#### 👥 Multi-Agent Collaboration

See 5 specialized agents in action:

1. **Supervisor** - Analyzes goals, coordinates team, scores quality
2. **Researcher** - Analyzes requirements and recommends tech stack
3. **Engineer** - Implements code, database models, API endpoints
4. **Critic** - Performs code review and security analysis
5. **Synthesizer** - Creates documentation and deployment guides

#### 📊 Real-Time Metrics

Track orchestration progress with live metrics:

- **Progress**: Visual percentage and step tracking
- **Cost**: Running total of API costs and token usage
- **Quality Score**: Final assessment score (8.7/10)
- **Active Agent**: Current agent and their role

#### 🎬 Interactive Controls

- **Play/Pause**: Control simulation playback
- **Reset**: Restart from the beginning
- **Auto-progression**: Watch agents work sequentially

#### 📦 Deliverables Showcase

See the complete output:

- ✅ Clean, typed FastAPI source code
- ✅ 87% test coverage with pytest
- ✅ Comprehensive documentation (API, deployment, contributing)
- ✅ Security features (JWT, password hashing, validation)
- ✅ Docker deployment configuration
- ✅ Quality score with detailed feedback

### How It Works

The simulation demonstrates a complete orchestration workflow:

1. **Goal Analysis** (Supervisor)
   - Analyzes complexity and requirements
   - Selects optimal agent team
   - Estimates completion time

2. **Research Phase** (Researcher)
   - Analyzes requirements
   - Recommends tech stack (FastAPI, SQLite, JWT)
   - Defines architecture pattern

3. **Implementation** (Engineer)
   - Creates project structure
   - Implements 7 RESTful endpoints
   - Adds authentication and database models

4. **Quality Review** (Critic)
   - Performs code review (4/4 stars)
   - Conducts security analysis
   - Validates 87% test coverage

5. **Documentation & Integration** (Synthesizer)
   - Creates comprehensive documentation
   - Adds deployment artifacts
   - Provides integration tests

6. **Final Assessment** (Supervisor)
   - Overall quality score: 8.7/10
   - Individual agent scores
   - Extracts learnings for future runs
   - Cost analysis: $0.268 total

### Technical Details

- **Self-contained**: No external dependencies or API calls
- **Pure JavaScript**: Runs entirely in the browser
- **Responsive Design**: Works on desktop, tablet, and mobile
- **No Backend Required**: Static HTML file

### Usage

**Method 1: Direct Browser Access**

```bash
# Open directly in browser
open demo-orchestration-sim.html    # macOS
xdg-open demo-orchestration-sim.html  # Linux
start demo-orchestration-sim.html   # Windows
```

**Method 2: Local Web Server**

```bash
# Python
python3 -m http.server 8080

# Node.js
npx http-server

# Then navigate to:
http://localhost:8080/demo-orchestration-sim.html
```

**Method 3: GitHub Pages**
Once GitHub Pages is enabled:

```
https://xfaith4.github.io/UnifiedAIToolbox/demo-orchestration-sim.html
```

---

## Animated Overview Demo

### What It Shows

The Unified AI Toolbox Animated Demo (`demo-animated.html`) is an interactive, visually stunning showcase of the platform's capabilities. It takes viewers on a journey from a high-level idea through multi-agent orchestration to a fully designed software application.

## Features

### 🎨 Visual Design

- **Dark Theme**: Modern dark interface with gradient accents (purple, pink, blue)
- **Animations**: Smooth CSS animations throughout including:
  - Gradient background shifting
  - 50 floating particles
  - Fade-in and slide-up section transitions
  - Pulse, bounce, and glow effects
  - 3D card rotations
  - Shine effects on hover
- **Responsive**: Fully responsive design that works on all screen sizes

### 📖 Content Sections

1. **Hero Section**
   - Eye-catching title with gradient text
   - Tagline: "Transform Ideas into Reality with Multi-Agent Intelligence"
   - Animated scroll indicator

2. **Idea Section**
   - Starting point: High-level software idea
   - Pulsing animation to draw attention
   - Example: "Build a comprehensive software application with automated testing, documentation, and deployment pipeline"

3. **AI Supervisor Section**
   - Introduces the Supervisor agent
   - 4 key features:
     - Quality Assessment
     - Agent Scoring
     - Learning Loop
     - Cost Optimization
   - Shine effect animation

4. **Agent Library Section**
   - Showcases 9+ specialized AI agents:
     - 🎯 Supervisor - Quality gatekeeper
     - 🔬 Researcher - Analysis and data gathering
     - ⚙️ Engineer - Code implementation
     - 🔍 Critic - Quality assurance
     - 🔗 Synthesizer - Integration
     - 💼 Commissioner - Business value
     - 🛡️ Security Analyst - Vulnerability detection
     - 🎨 Design Artist - UI/UX design
     - ⚡ Performance Engineer - Optimization
   - 3D rotation reveal animation

5. **Workflow Section**
   - 5-step orchestration process:
     1. Intake - Capture and refine goal
     2. Research - Analyze requirements
     3. Implement - Build the solution
     4. Review - Validate quality
     5. Synthesize - Integrate and document
   - Sequential pulse animations

6. **Capabilities Section**
   - 6 enterprise-grade feature categories:
     - 🎯 Prompt Management
     - 🔌 AI Provider Integration
     - 📊 Cost & Analytics
     - 🔄 Learning Loop
     - 🛡️ Enterprise Security
     - 🚀 CI/CD Pipeline
   - Hover effects with sliding shine

7. **Final Result Section**
   - Showcases the output: Fully designed software application
   - 6 deliverables:
     - 📝 Source Code (clean, documented, tested)
     - 🧪 Tests (unit, integration, E2E)
     - 📚 Documentation (API refs, guides)
     - 🔒 Security (scanned & validated)
     - ⚙️ CI/CD (automated workflows)
     - 🎨 UI/UX (modern design system)
   - Reveal animation with 3D perspective

8. **Call-to-Action Section**
   - Links to get started
   - GitHub repository link
   - Launch portal link
   - Technology stack information

## Usage

### Opening the Demo

**Method 1: Direct File Access**
Simply open `demo-animated.html` in any modern web browser:

```bash
# macOS
open demo-animated.html

# Linux
xdg-open demo-animated.html

# Windows
start demo-animated.html
```

**Method 2: Via HTTP Server**
For best results, serve via HTTP:

```bash
# Python
python3 -m http.server 8080

# Node.js
npx http-server

# Then navigate to:
http://localhost:8080/demo-animated.html
```

**Method 3: Via GitHub Pages**
Once GitHub Pages is enabled for the repository (Settings → Pages → Source: main branch):

```
https://xfaith4.github.io/UnifiedAIToolbox/demo-animated.html
```

**Method 4: Via Launch Portal**
The demo is linked from the main [Launch Portal](../launch-portal.html) for easy access.

### Navigation

- **Scroll Down**: Sections appear with smooth animations as you scroll
- **Hover Effects**: Hover over cards and buttons to see interactive effects
- **Click Links**: Navigate to README, GitHub, or Launch Portal
- **Responsive**: Works on desktop, tablet, and mobile devices
- **Reduced Motion**: Respects system-level `prefers-reduced-motion` settings and suppresses background particles when enabled

### Hosting on GitHub Pages

- The demo is fully self-contained (no external assets) and works when served from `/demo-animated.html` at the repository root.
- For this repository, the published URL is `https://xfaith4.github.io/UnifiedAIToolbox/demo-animated.html` once GitHub Pages is enabled for the `main` branch.
- Relative links point back to the GitHub README and portal launcher so navigation continues to work under the `/UnifiedAIToolbox/` base path.

## Technical Details

### Technologies Used

- **HTML5**: Semantic markup
- **CSS3**: Advanced animations and effects
  - Keyframe animations
  - CSS transforms (translate, rotate, scale)
  - Transitions
  - Gradients (linear, radial)
  - Flexbox and Grid layouts
  - Backdrop filters
- **Vanilla JavaScript**: Particle generation, scroll detection, intersection observer

### Browser Compatibility

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Opera 76+

### Performance

- Optimized animations using CSS transforms (GPU-accelerated)
- Intersection Observer for efficient scroll detection
- Minimal JavaScript for better performance
- No external dependencies

## Customization

### Changing Colors

Edit the CSS gradient colors in the `<style>` section:

```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
```

### Adding/Removing Agents

Modify the `.agents-grid` section in HTML to add or remove agent cards.

### Adjusting Animation Speed

Change animation duration in CSS:

```css
animation: agentAppear 0.5s ease-out forwards;  /* Change 0.5s to your preference */
```

### Modifying Content

All content is in plain HTML - simply edit the text within each section.

## Integration

### Linking to Demo

Add to your documentation or website:

```markdown
🌟 **[View Animated Demo](demo-animated.html)** - Experience the toolbox capabilities!
```

### Embedding

The demo can be embedded in an iframe:

```html
<iframe src="demo-animated.html" width="100%" height="800px" frameborder="0"></iframe>
```

## Accessibility

- Semantic HTML structure
- Proper heading hierarchy (h1, h2, h3, h4)
- Alt text for visual elements
- Keyboard navigation support
- Color contrast ratios meet WCAG guidelines

## Future Enhancements

Potential improvements for future versions:

- [ ] Add video background or demo recordings
- [ ] Interactive agent selection to show details
- [ ] Real-time code examples
- [ ] Integration with live API demos
- [ ] Analytics tracking for demo engagement
- [ ] Dark/light mode toggle
- [ ] Multiple language support
- [ ] Downloadable PDF version

---

## GitHub Pages Setup

To make the demos accessible via GitHub Pages (e.g., `https://xfaith4.github.io/UnifiedAIToolbox/demo-orchestration-sim.html`):

1. **Enable GitHub Pages:**
   - Go to repository Settings
   - Navigate to Pages section
   - Under "Source", select "main" branch
   - Click Save

2. **Access the Demos:**
   - Orchestration Simulation: `https://xfaith4.github.io/UnifiedAIToolbox/demo-orchestration-sim.html`
   - Animated Overview: `https://xfaith4.github.io/UnifiedAIToolbox/demo-animated.html`

3. **Verification:**
   - Wait a few minutes for GitHub Pages to deploy
   - Visit the URLs to confirm they work
   - Both demos are self-contained and require no backend

**Note:** If you see a 404 error, ensure GitHub Pages is enabled and the branch is set to `main`. The deployment can take 1-5 minutes after enabling.

---

## Feedback

Found an issue or have suggestions for the demo? Please [open an issue](https://github.com/xfaith4/UnifiedAIToolbox/issues) on GitHub.

---

**Version**: 1.1
**Last Updated**: January 2026
**Status**: Production Ready
