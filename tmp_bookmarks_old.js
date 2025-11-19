const places = require('places/places.js')
const urlParser = require('util/urlParser.js')
const formatRelativeDate = require('util/relativeDate.js')

const listEl = document.getElementById('bookmarks-list')
const addUrlInput = document.getElementById('bookmark-add-url')
const addTitleInput = document.getElementById('bookmark-add-title')
const addButton = document.getElementById('bookmark-add-button')

function normalizeURL (input) {
  if (!input) {
    return null
  }
  let url = input.trim()
  if (!url) {
    return null
  }

  // add protocol if missing so common inputs like "example.com" work
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    url = 'https://' + url
  }

  return url
}

function createBookmarkItem (item, onChange) {
  const container = document.createElement('div')
  container.className = 'setting-section'

  const titleRow = document.createElement('div')
  titleRow.style.display = 'flex'
  titleRow.style.justifyContent = 'space-between'
  titleRow.style.alignItems = 'center'

  const title = document.createElement('div')
  title.textContent = item.title || urlParser.basicURL(urlParser.getSourceURL(item.url))
  titleRow.appendChild(title)

  const deleteButton = document.createElement('button')
  deleteButton.className = 'secondary-button'
  deleteButton.textContent = 'Delete'
  deleteButton.addEventListener('click', function (e) {
    e.stopPropagation()
    places.deleteHistory(item.url)
    if (onChange) {
      onChange()
    }
  })
  titleRow.appendChild(deleteButton)

  container.appendChild(titleRow)

  const secondary = document.createElement('div')
  secondary.className = 'settings-info-subheading'
  const basicURL = urlParser.basicURL(urlParser.getSourceURL(item.url))
  const relativeDate = item.lastVisit ? formatRelativeDate(item.lastVisit) : ''
  secondary.textContent = relativeDate ? (basicURL + ' — ' + relativeDate) : basicURL
  container.appendChild(secondary)

  container.addEventListener('click', function () {
    window.location = urlParser.getSourceURL(item.url)
  })

  return container
}

function renderEmptyState (message) {
  listEl.textContent = ''
  const empty = document.createElement('div')
  empty.className = 'settings-info-subheading'
  empty.textContent = message
  listEl.appendChild(empty)
}

async function renderBookmarks () {
  let items
  try {
    items = await places.getAllItems()
  } catch (e) {
    renderEmptyState('Unable to load bookmarks.')
    // eslint-disable-next-line no-console
    console.error('Failed to load bookmarks', e)
    return
  }

  const bookmarks = items
    .filter(item => item.isBookmarked)
    .sort((a, b) => b.lastVisit - a.lastVisit)

  listEl.textContent = ''

  if (!bookmarks.length) {
    renderEmptyState('No bookmarks yet.')
    return
  }

  bookmarks.forEach(item => {
    listEl.appendChild(createBookmarkItem(item, renderBookmarks))
  })
}

async function handleAddBookmark (e) {
  if (e) {
    e.preventDefault()
  }

  const normalizedURL = normalizeURL(addUrlInput.value)
  if (!normalizedURL) {
    return
  }

  const title = (addTitleInput.value || '').trim()

  try {
    await places.updateItem(normalizedURL, {
      title: title || normalizedURL,
      isBookmarked: true,
      lastVisit: Date.now()
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to add bookmark', err)
  }

  addUrlInput.value = ''
  addTitleInput.value = ''
  renderBookmarks()
}

if (addButton && addUrlInput && addTitleInput) {
  addButton.addEventListener('click', handleAddBookmark)

  addUrlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      handleAddBookmark(e)
    }
  })

  addTitleInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      handleAddBookmark(e)
    }
  })
}

renderBookmarks()

