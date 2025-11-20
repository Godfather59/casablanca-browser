## Usage statistics collection in Casablanca

Usage statistic uploads are **disabled by default** in this build. When disabled, Casablanca clears saved identifiers and does not start any background timers or network requests.

If you explicitly opt in (by setting `collectUsageStats` to `true` in `settings.json`), the browser will only send anonymized, aggregate data:

* Your operating system and language
* The Casablanca version and install time
* Anonymous feature usage counters
* A random installation identifier (not tied to browsing data)

Casablanca never sends:
* Any browsing history, passwords, or other data stored locally
* Anything that can be used to personally identify you
