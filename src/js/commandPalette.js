const browserUI = require('browserUI.js')
const readerView = require('readerView.js')
const settings = require('util/settings/settings.js')

const commandPalette = {
  container: null,
  input: null,
  resultsContainer: null,
  isOpen: false,
  commands: [],
  filteredCommands: [],
  selectedIndex: 0,

  initialize: function () {
    // Defines the available commands
    this.commands = [
      {
        name: 'New Tab',
        shortcut: 'Ctrl+T',
        action: () => browserUI.addTab()
      },
      {
        name: 'New Private Tab',
        shortcut: 'Shift+Ctrl+P',
        action: () => browserUI.addTab(tabs.add({ private: true }))
      },
      {
        name: 'Close Tab',
        shortcut: 'Ctrl+W',
        action: () => browserUI.closeTab(tabs.getSelected())
      },
      {
        name: 'Next Tab',
        shortcut: 'Ctrl+Tab',
        action: () => {
             const currentIndex = tabs.getIndex(tabs.getSelected())
             const nextTab = tabs.getAtIndex(currentIndex + 1) || tabs.getAtIndex(0)
             browserUI.switchToTab(nextTab.id)
        }
      },
      {
        name: 'Previous Tab',
        shortcut: 'Ctrl+Shift+Tab',
        action: () => {
             const currentIndex = tabs.getIndex(tabs.getSelected())
             const prevTab = tabs.getAtIndex(currentIndex - 1) || tabs.getAtIndex(tabs.count() - 1)
             browserUI.switchToTab(prevTab.id)
        }
      },
      {
        name: 'Toggle Reader View',
        shortcut: 'Ctrl+Shift+R',
        action: () => {
            const tabId = tabs.getSelected()
            if (readerView.isReader(tabId)) {
                readerView.exit(tabId)
            } else {
                readerView.enter(tabId)
            }
        }
      },
      {
        name: 'Reload Page',
        shortcut: 'Ctrl+R',
        action: () => webviews.callAsync(tabs.getSelected(), 'reload')
      },
       {
        name: 'Go Back',
        shortcut: 'Alt+Left',
        action: () => webviews.callAsync(tabs.getSelected(), 'goBack')
      },
      {
        name: 'Go Forward',
        shortcut: 'Alt+Right',
        action: () => webviews.callAsync(tabs.getSelected(), 'goForward')
      }
    ]

    // Create DOM elements if they don't exist
    if (!document.getElementById('command-palette-overlay')) {
        this.createDOM()
    }
  },

  createDOM: function() {
    this.container = document.createElement('div')
    this.container.id = 'command-palette-overlay'
    this.container.hidden = true

    this.input = document.createElement('input')
    this.input.id = 'command-palette-input'
    this.input.placeholder = 'Type a command...'
    
    this.resultsContainer = document.createElement('ul')
    this.resultsContainer.id = 'command-palette-results'

    this.container.appendChild(this.input)
    this.container.appendChild(this.resultsContainer)

    document.body.appendChild(this.container)

    // Event Listeners
    this.input.addEventListener('input', () => this.filterCommands())
    this.input.addEventListener('keydown', (e) => this.handleKey(e))
    
    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (this.isOpen && !this.container.contains(e.target)) {
            this.hide()
        }
    })
  },

  toggle: function () {
    if (!this.container) this.initialize()
    
    if (this.isOpen) {
        this.hide()
    } else {
        this.show()
    }
  },

  show: function () {
    this.isOpen = true
    this.container.hidden = false
    this.input.value = ''
    this.input.focus()
    this.filterCommands() // Show all initially
  },

  hide: function () {
    this.isOpen = false
    this.container.hidden = true
    webviews.focus() // Return focus to webview
  },

  filterCommands: function () {
    const query = this.input.value.toLowerCase()
    this.filteredCommands = this.commands.filter(cmd => 
        cmd.name.toLowerCase().includes(query)
    )
    this.selectedIndex = 0
    this.render()
  },

  render: function () {
    this.resultsContainer.innerHTML = ''
    this.filteredCommands.forEach((cmd, index) => {
        const li = document.createElement('li')
        li.className = 'command-palette-item'
        if (index === this.selectedIndex) {
            li.classList.add('selected')
        }
        
        li.innerHTML = `
            <span class="command-name">${cmd.name}</span>
            <span class="command-palette-shortcut">${cmd.shortcut || ''}</span>
        `
        
        li.onclick = () => {
            cmd.action()
            this.hide()
        }
        
        this.resultsContainer.appendChild(li)
    })
  },

  handleKey: function (e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredCommands.length - 1)
        this.render()
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0)
        this.render()
    } else if (e.key === 'Enter') {
        e.preventDefault()
        if (this.filteredCommands[this.selectedIndex]) {
            this.filteredCommands[this.selectedIndex].action()
            this.hide()
        }
    } else if (e.key === 'Escape') {
        e.preventDefault()
        this.hide()
    }
  }
}

module.exports = commandPalette
