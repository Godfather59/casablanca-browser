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

const listEl = document.getElementById('bookmarks-list')
const searchInput = document.getElementById('bookmark-search')
const countEl = document.getElementById('bookmark-count')
const importButton = document.getElementById('import-bookmarks')
const importInput = document.getElementById('import-input')

let allBookmarks = []

if (!ipcRenderer) {
  listEl.innerHTML = '<div class="empty-state">IPC not available; cannot load bookmarks.</div>'
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
    updatePlace: function (pageData) {
      return invoke('updatePlace', pageData)
    },
    deleteBookmark: function (url) {
      return invoke('updatePlace', { url, isBookmarked: false })
    }
  }
}

const placesClient = createPlacesClient()

function createBookmarkRow (item) {
  const row = document.createElement('div')
  row.className = 'list-item'

  const icon = document.createElement('span')
  icon.className = 'list-icon i carbon:bookmark-filled'
  row.appendChild(icon)

  const titleWrap = document.createElement('div')
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
  actions.className = 'bookmark-actions'
  const editBtn = document.createElement('button')
  editBtn.textContent = 'Edit'
  editBtn.className = 'small-btn'
  editBtn.addEventListener('click', async function (e) {
    e.stopPropagation()
    const newTitle = prompt('Edit title', item.title || '')
    if (newTitle !== null) {
      item.title = newTitle
      await placesClient.updatePlace({ url: item.url, title: newTitle, isBookmarked: true })
      renderList(allBookmarks)
    }
  })
  const delBtn = document.createElement('button')
  delBtn.textContent = 'Delete'
  delBtn.className = 'small-btn danger'
  delBtn.addEventListener('click', async function (e) {
    e.stopPropagation()
    await placesClient.deleteBookmark(item.url)
    allBookmarks = allBookmarks.filter(b => b.url !== item.url)
    renderList(allBookmarks)
  })
  actions.appendChild(editBtn)
  actions.appendChild(delBtn)
  row.appendChild(actions)

  row.addEventListener('click', function () {
    window.location = item.url
  })

  return row
}

function renderList (items) {
  listEl.innerHTML = ''

  if (!items.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.textContent = 'No bookmarks yet.'
    listEl.appendChild(empty)
    countEl.textContent = ''
    return
  }

  items.forEach(item => listEl.appendChild(createBookmarkRow(item)))
  countEl.textContent = items.length + ' saved item' + (items.length === 1 ? '' : 's')
}

function applyFilter () {
  const term = (searchInput.value || '').toLowerCase().trim()
  if (!term) {
    renderList(allBookmarks)
    return
  }
  const filtered = allBookmarks.filter(item => {
    const title = (item.title || '').toLowerCase()
    const url = (item.url || '').toLowerCase()
    return title.includes(term) || url.includes(term)
  })
  renderList(filtered)
}

searchInput.addEventListener('input', applyFilter)
importButton.addEventListener('click', function (e) {
  e.preventDefault()
  importInput.click()
})

importInput.addEventListener('change', function (e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async function (evt) {
    try {
      const data = evt.target.result
      if (!data) return
      const tree = new DOMParser().parseFromString(data, 'text/html')
      const anchors = Array.from(tree.getElementsByTagName('a'))
      const updates = anchors.map(function (a) {
        const href = a.getAttribute('href')
        if (!href || (!href.startsWith('http:') && !href.startsWith('https:') && !href.startsWith('file:'))) {
          return null
        }
        const update = {
          url: href,
          title: a.textContent,
          isBookmarked: true,
          tags: [],
          lastVisit: Date.now()
        }
        const addDate = parseInt(a.getAttribute('add_date'))
        if (!isNaN(addDate)) {
          update.lastVisit = addDate * 1000
        }
        if (a.getAttribute('tags')) {
          update.tags = a.getAttribute('tags').split(',')
        }
        return update
      }).filter(Boolean)

      for (const item of updates) {
        await placesClient.updatePlace(item)
      }
      // reload list after import
      const items = await placesClient.getAllPlaces()
      allBookmarks = items.filter(i => i.isBookmarked).sort((a, b) => b.lastVisit - a.lastVisit)
      renderList(allBookmarks)
    } catch (err) {
      console.error('Failed to import bookmarks', err)
    } finally {
      importInput.value = ''
    }
  }
  reader.readAsText(file, 'utf-8')
})

placesClient.getAllPlaces().then(function (items) {
  allBookmarks = items
    .filter(item => item.isBookmarked)
    .sort((a, b) => b.lastVisit - a.lastVisit)
  renderList(allBookmarks)
}).catch(function (e) {
  const empty = document.createElement('div')
  empty.className = 'empty-state'
  empty.textContent = 'Unable to load bookmarks.'
  listEl.appendChild(empty)
  countEl.textContent = ''
  // eslint-disable-next-line no-console
  console.error('Failed to load bookmarks', e)
})

