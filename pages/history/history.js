const ipcRenderer = window.ipc || null

function basicURL (u) {
  try {
    const url = new URL(u)
    return (url.host + url.pathname).replace(/\/$/, '') || url.host || u
  } catch (e) {
    return u
  }
}

function formatRelativeDate (ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const day = 24 * 60 * 60 * 1000
  if (diff < day) return 'Today'
  if (diff < 2 * day) return 'Yesterday'
  return new Date(ts).toLocaleDateString()
}

const listEl = document.getElementById('history-list')
const searchInput = document.getElementById('history-search')
const countEl = document.getElementById('history-count')
const clearBtn = document.getElementById('clear-history')

let allHistory = []

if (!ipcRenderer) {
  listEl.innerHTML = '<div class="empty-state">IPC not available; cannot load history.</div>'
}

function createPlacesClient () {
  let messagePort = null
  const pending = {}
  let nextId = 1

  function connect () {
    return new Promise((resolve) => {
      if (messagePort) {
        resolve()
        return
      }
      const { port1, port2 } = new MessageChannel()
      ipcRenderer.postMessage('places-connect', null, [port2])
      port1.addEventListener('message', function (e) {
        if (e.data && e.data.callbackId && pending[e.data.callbackId]) {
          pending[e.data.callbackId].resolve(e.data.result)
          delete pending[e.data.callbackId]
        }
      })
      port1.start()
      messagePort = port1
      resolve()
    })
  }

  function invoke (action, pageData) {
    return connect().then(function () {
      return new Promise((resolve) => {
        const callbackId = nextId++
        pending[callbackId] = { resolve }
        messagePort.postMessage({
          action,
          pageData: pageData || {},
          callbackId
        })
      })
    })
  }

  return {
    getAllPlaces: function () {
      return invoke('getAllPlaces')
    },
    deleteHistory: function (url) {
      return invoke('deleteHistory', { url })
    },
    deleteAll: function () {
      return invoke('deleteAllHistory')
    }
  }
}

const placesClient = createPlacesClient()

function iconForItem (item) {
  return item.isBookmarked ? 'carbon:bookmark' : 'carbon:time'
}

function createHistoryRow (item) {
  const row = document.createElement('div')
  row.className = 'history-row'

  const icon = document.createElement('span')
  icon.className = 'list-icon i ' + iconForItem(item)
  row.appendChild(icon)

  const titleWrap = document.createElement('div')
  titleWrap.className = 'history-main'
  const title = document.createElement('p')
  title.className = 'list-title'
  title.textContent = item.title || basicURL(item.url)
  titleWrap.appendChild(title)

  const urlEl = document.createElement('div')
  urlEl.className = 'list-url'
  urlEl.textContent = basicURL(item.url)
  titleWrap.appendChild(urlEl)
  row.appendChild(titleWrap)

  const meta = document.createElement('div')
  meta.className = 'list-meta'
  meta.textContent = item.lastVisit ? formatRelativeDate(item.lastVisit) : '-'
  row.appendChild(meta)

  const actions = document.createElement('div')
  actions.className = 'history-actions'
  const delBtn = document.createElement('button')
  delBtn.className = 'small-btn danger'
  delBtn.textContent = 'Delete'
  delBtn.addEventListener('click', async function (e) {
    e.stopPropagation()
    await placesClient.deleteHistory(item.url)
    allHistory = allHistory.filter(i => i.url !== item.url)
    renderList(allHistory)
  })
  actions.appendChild(delBtn)
  row.appendChild(actions)

  row.addEventListener('click', function () {
    window.location = item.url
  })

  return row
}

function groupByDay (items) {
  const groups = {}
  items.forEach(item => {
    const day = new Date(item.lastVisit || Date.now())
    const key = day.toDateString()
    groups[key] = groups[key] || []
    groups[key].push(item)
  })
  return Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).map(key => ({
    title: formatRelativeDate(new Date(key).getTime()),
    items: groups[key].sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0))
  }))
}

function renderList (items) {
  listEl.innerHTML = ''

  if (!items.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'No history yet.'
    listEl.appendChild(empty)
    countEl.textContent = ''
    return
  }

  groupByDay(items).forEach(group => {
    const container = document.createElement('div')
    container.className = 'history-group'

    const header = document.createElement('header')
    header.textContent = group.title
    container.appendChild(header)

    group.items.forEach(item => container.appendChild(createHistoryRow(item)))
    listEl.appendChild(container)
  })

  countEl.textContent = items.length + ' item' + (items.length === 1 ? '' : 's')
}

function applyFilter () {
  if (!searchInput) {
    renderList(allHistory)
    return
  }
  const term = (searchInput.value || '').toLowerCase().trim()
  if (!term) {
    renderList(allHistory)
    return
  }
  const filtered = allHistory.filter(item => {
    const title = (item.title || '').toLowerCase()
    const url = (item.url || '').toLowerCase()
    return title.includes(term) || url.includes(term)
  })
  renderList(filtered)
}

if (searchInput) {
  searchInput.addEventListener('input', applyFilter)
}

if (clearBtn) {
  clearBtn.addEventListener('click', async function () {
    if (!confirm('Clear all history?')) return
    await placesClient.deleteAll()
    allHistory = []
    renderList(allHistory)
  })
}

placesClient.getAllPlaces().then(function (items) {
  allHistory = items
    .filter(item => !item.isBookmarked)
    .sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0))
  renderList(allHistory)
}).catch(function (e) {
  const empty = document.createElement('div')
  empty.className = 'empty-state'
  empty.textContent = 'Unable to load history.'
  listEl.appendChild(empty)
  countEl.textContent = ''
  console.error('Failed to load history', e)
})
