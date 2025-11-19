/* fades out tabs that are inactive */

var tabBar = require('navbar/tabBar.js')

var tabActivity = {
  minFadeAge: 330000,
  intervalId: null,
  refresh: function () {
    requestAnimationFrame(function () {
      var tabSet = tabs.get()
      var selected = tabs.getSelected()
      var time = Date.now()

      tabSet.forEach(function (tab) {
        if (selected === tab.id) { // never fade the current tab
          tabBar.getTab(tab.id).classList.remove('fade')
          return
        }
        if (time - tab.lastActivity > tabActivity.minFadeAge) { // the tab has been inactive for greater than minActivity, and it is not currently selected
          tabBar.getTab(tab.id).classList.add('fade')
        } else {
          tabBar.getTab(tab.id).classList.remove('fade')
        }
      })
    })
  },
  initialize: function () {
    if (!tabActivity.intervalId) {
      tabActivity.intervalId = setInterval(tabActivity.refresh, 7500)
    }

    tasks.on('tab-selected', this.refresh)

    // clear the activity timer when this renderer window is closed
    window.addEventListener('beforeunload', function () {
      if (tabActivity.intervalId) {
        clearInterval(tabActivity.intervalId)
        tabActivity.intervalId = null
      }
    })
  }
}

module.exports = tabActivity
