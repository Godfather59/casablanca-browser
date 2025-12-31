// Casablanca Browser - Main Entry Point

// Import base styles
import '../css/base.css'

// Windows-only build
document.body.classList.add('windows')
document.body.classList.add('focused')

// Initialize the browser
import './browser.js'

console.log('Casablanca Browser starting...')
