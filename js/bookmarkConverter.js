/* Handles importing / exporting bookmarks to HTML */

const places = require('places/places.js')
const urlParser = require('util/urlParser.js')
const settings = require('util/settings/settings.js')
const path = require('path')
const fs = require('fs')

const bookmarkConverter = {
  backupTimeoutId: null,
  backupIntervalId: null,

  import: function (data) {
    const tree = new DOMParser().parseFromString(data, 'text/html')
    const bookmarks = Array.from(tree.getElementsByTagName('a'))

    bookmarks.forEach(function (bookmark) {
      const url = bookmark.getAttribute('href')
      if (!url || (!url.startsWith('http:') && !url.startsWith('https:') && !url.startsWith('file:'))) {
        return
      }

      const bookmarkData = {
        title: bookmark.textContent,
        isBookmarked: true,
        tags: [],
        lastVisit: Date.now()
      }

      try {
        const last = parseInt(bookmark.getAttribute('add_date')) * 1000
        if (!isNaN(last)) {
          bookmarkData.lastVisit = last
        }
      } catch (e) { }

      let parent = bookmark.parentElement
      while (parent != null) {
        if (parent.children[0] && parent.children[0].tagName === 'H3') {
          bookmarkData.tags.push(parent.children[0].textContent.replace(/\s/g, '-'))
          break
        }
        parent = parent.parentElement
      }

      if (bookmark.getAttribute('tags')) {
        bookmarkData.tags = bookmarkData.tags.concat(bookmark.getAttribute('tags').split(','))
      }

      places.updateItem(url, bookmarkData)
    })
  },

  exportAll: function () {
    return new Promise(function (resolve, reject) {
      // build the tree structure
      const root = document.createElement('body')
      const heading = document.createElement('h1')
      heading.textContent = 'Bookmarks'
      root.appendChild(heading)

      const innerRoot = document.createElement('dl')
      root.appendChild(innerRoot)

      const folderRoot = document.createElement('dt')
      innerRoot.appendChild(folderRoot)

      const folderBookmarksList = document.createElement('dl')
      folderRoot.appendChild(folderBookmarksList)

      places.getAllItems().then(function (items) {
        items.forEach(function (item) {
          if (!item.isBookmarked) {
            return
          }

          const itemRoot = document.createElement('dt')
          const a = document.createElement('a')
          itemRoot.appendChild(a)
          folderBookmarksList.appendChild(itemRoot)

          a.href = urlParser.getSourceURL(item.url)
          a.setAttribute('add_date', Math.round(item.lastVisit / 1000))
          if (item.tags.length > 0) {
            a.setAttribute('tags', item.tags.join(','))
          }
          a.textContent = item.title

          // Chrome will only parse the file if it contains newlines after each bookmark
          const textSpan = document.createTextNode('\n')
          folderBookmarksList.appendChild(textSpan)
        })

        resolve(root.outerHTML)
      }).catch(reject)
    })
  },

  initialize: function () {
    // how often to create a new backup file
    const interval = (3 * 24 * 60 * 60 * 1000)
    // min size in bytes for a backup
    // This is necessary because after the database is destroyed, the browser will launch with no bookmarks
    // and the bookmarks backup shouldn't be overwritten in that case
    const minSize = 512

    if (bookmarkConverter.backupTimeoutId || bookmarkConverter.backupIntervalId) {
      return
    }

    const checkAndExport = function () {
      const lastBackup = settings.get('lastBookmarksBackup')
      if (lastBackup && (Date.now() - lastBackup) <= interval) {
        return
      }

      bookmarkConverter.exportAll().then(function (res) {
        if (res.length <= minSize) {
          return
        }

        fs.writeFile(
          path.join(window.globalArgs['user-data-path'], 'bookmarksBackup.html'),
          res,
          { encoding: 'utf-8' },
          function (err) {
            if (err) {
              console.warn(err)
              return
            }

            settings.set('lastBookmarksBackup', Date.now())
          }
        )
      }).catch(e => console.warn('error generating bookmarks backup', e))
    }

    bookmarkConverter.backupTimeoutId = setTimeout(checkAndExport, 10000)
    bookmarkConverter.backupIntervalId = setInterval(checkAndExport, interval / 3)
  },

  stopAutomaticBackups: function () {
    if (bookmarkConverter.backupTimeoutId) {
      clearTimeout(bookmarkConverter.backupTimeoutId)
      bookmarkConverter.backupTimeoutId = null
    }

    if (bookmarkConverter.backupIntervalId) {
      clearInterval(bookmarkConverter.backupIntervalId)
      bookmarkConverter.backupIntervalId = null
    }
  }
}

module.exports = bookmarkConverter
