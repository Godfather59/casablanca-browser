const UPDATE_URL = 'https://minbrowser.org/min/updates/latestVersion.json'

var settings = require('util/settings/settings.js')

var searchbarPlugins = require('searchbar/searchbarPlugins.js')
var compareVersions = require('util/compareVersions.js')

var updateTimeoutId = null
var updateIntervalId = null

function getUpdateRandomNum () {
  /* the update JSON might indicate that the update is only available to a % of clients, in order to avoid notifying everyone to update to a new version until there's time to report bugs.
      Create a random number that is saved locally, and compare this to the indicated % to determine if the update notification should be shown. */

  if (!localStorage.getItem('updateRandomNumber')) {
    localStorage.setItem('updateRandomNumber', Math.random())
  }
  return parseFloat(localStorage.getItem('updateRandomNumber'))
}

function getAvailableUpdates () {
  // Update checking is disabled in this build to avoid
  // background network requests.
  localStorage.removeItem('availableUpdate')
  console.info('update checking is disabled')
}

function showUpdateNotification (text, input, inputFlags) {
  function displayUpdateNotification () {
    searchbarPlugins.reset('updateNotifications')
    searchbarPlugins.addResult('updateNotifications', {
      title: l('updateNotificationTitle'),
      descriptionBlock: update.releaseHeadline || 'View release notes',
      url: update.releaseNotes,
      icon: 'carbon:renew'
    }, { allowDuplicates: true })
  }
  // is there an update?
  var update = JSON.parse(localStorage.getItem('availableUpdate'))
  if (update) {
    // was the update already installed?
    if (compareVersions(window.globalArgs['app-version'], update.version) <= 0) {
      return
    }
    var updateAge = Date.now() - update.releaseTime
    /* initially, only show an update notification when no tabs are open, in order to minimize disruption */
    if (updateAge < (3 * 7 * 24 * 60 * 60 * 1000)) {
      if (tabs.isEmpty()) {
        displayUpdateNotification()
      }
    } else {
      /* after 3 weeks, start showing a notification on all new tabs */
      if (!tabs.get(tabs.getSelected()).url) {
        displayUpdateNotification()
      }
    }
  }
}

updateTimeoutId = setTimeout(getAvailableUpdates, 30000)
updateIntervalId = setInterval(getAvailableUpdates, 24 * 60 * 60 * 1000)

function initialize () {
  searchbarPlugins.register('updateNotifications', {
    index: 11,
    trigger: function (text) {
      return !text && performance.now() > 5000
    },
    showResults: showUpdateNotification
  })

  // clear update timers when the window is closed
  window.addEventListener('beforeunload', function () {
    if (updateTimeoutId) {
      clearTimeout(updateTimeoutId)
      updateTimeoutId = null
    }

    if (updateIntervalId) {
      clearInterval(updateIntervalId)
      updateIntervalId = null
    }
  })
}

module.exports = { initialize }
