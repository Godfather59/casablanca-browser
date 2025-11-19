const places = require('places/places.js')
const urlParser = require('util/urlParser.js')
const formatRelativeDate = require('util/relativeDate.js')

const listEl = document.getElementById('bookmarks-list')

function createBookmarkItem (item) {
  const container = document.createElement('div')
  container.className = 'setting-section'

  const title = document.createElement('div')
  title.textContent = item.title || urlParser.basicURL(urlParser.getSourceURL(item.url))
  container.appendChild(title)

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

places.getAllItems().then(function (items) {
  const bookmarks = items
    .filter(item => item.isBookmarked)
    .sort((a, b) => b.lastVisit - a.lastVisit)

  if (!bookmarks.length) {
    const empty = document.createElement('div')
    empty.className = 'settings-info-subheading'
    empty.textContent = 'No bookmarks yet.'
    listEl.appendChild(empty)
    return
  }

  bookmarks.forEach(item => {
    listEl.appendChild(createBookmarkItem(item))
  })
}).catch(function (e) {
  const empty = document.createElement('div')
  empty.className = 'settings-info-subheading'
  empty.textContent = 'Unable to load bookmarks.'
  listEl.appendChild(empty)
  // eslint-disable-next-line no-console
  console.error('Failed to load bookmarks', e)
})

