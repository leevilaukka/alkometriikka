(function saAutomatedEvents(window) {
  // Skip server side rendered pages
  if (typeof window === "undefined") return;

  let log = function (message, type) {
    let logger = type === "warn" ? console.warn : console.info;
    return logger && logger("Simple Analytics auto events:", message);
  };

  let doc = window.document;

  let scriptElement =
    doc.currentScript || doc.querySelector('script[src*="auto-events.js"]');

  let setting = function (attribute, type, defaultValue) {
    let value = scriptElement && scriptElement.dataset[attribute];

    // Booleans
    if (type === "bool" && (value === "true" || value === "false"))
      return value === "true";
    else if (type === "bool") return defaultValue;

    // Arrays
    if (type === "array" && value)
      return value
        .split(",")
        .map(function (item) {
          return item.trim();
        })
        .filter(Boolean);
    else if (type === "array") return defaultValue;

    return value || defaultValue;
  };

  let collectTypes = setting("collect", "array", [
    "outbound",
    "emails",
    "downloads",
  ]);
  let fullUrls = setting("fullUrls", "bool", false);

  let options = {
    // What to collect
    outbound: collectTypes.indexOf("outbound") > -1,
    emails: collectTypes.indexOf("emails") > -1,
    downloads: collectTypes.indexOf("downloads") > -1,
    // Downloads: enter file extensions you want to collect
    downloadsExtensions: setting("extensions", "array", [
      "pdf",
      "csv",
      "docx",
      "xlsx",
      "zip",
      "doc",
      "xls",
    ]),

    // All: use title attribute if set for event name (for all events)
    // THIS TAKES PRECEDENCE OVER OTHER SETTINGS BELOW
    title: setting("useTitle", "bool", true),
    // Outbound: use full URL of the links? false for just the hostname
    outboundFullUrl: fullUrls,
    // Downloads: if taking event name from URL, use full URL or just filename (default)
    downloadsFullUrl: fullUrls,
  };

  let saGlobal = setting("saGlobal", "string", "sa_event");

  // For compiling the script
  let optionsLink = options;

  if (typeof optionsLink === "undefined")
    log("options object not found, please specify", "warn");

  window.saAutomatedLink = function saAutomatedLink(element, type) {
    try {
      if (!element) return log("no element found");

      if (window[saGlobal] && window[saGlobal + "_loaded"]) {
        let hostname = element.hostname;
        let pathname = element.pathname;

        let event;
        let metadata = {
          title: element.getAttribute("title") || undefined,
        };
        let url = element.href || undefined;

        let useTitle = false;
        if (optionsLink.title && element.hasAttribute("title")) {
          let theTitle = element.getAttribute("title").trim();
          if (theTitle != "") useTitle = true;
        }

        if (useTitle) {
          event = theTitle;
        } else {
          switch (type) {
            case "outbound": {
              event = hostname + (optionsLink.outboundFullUrl ? pathname : "");
              metadata.url = url;
              break;
            }
            case "download": {
              event = optionsLink.downloadsFullUrl
                ? hostname + pathname
                : pathname.split("/").pop();
              metadata.url = url;
              break;
            }
            case "email": {
              let href = element.getAttribute("href");
              event = (href.split(":")[1] || "").split("?")[0];
              metadata.email = event;
              break;
            }
          }
        }

        let clean =
          type +
          "_" +
          event.replace(/[^a-z0-9]+/gi, "_").replace(/(^_+|_+$)/g, "");

        window[saGlobal](clean, metadata);

        log("collected " + clean);
      } else {
        log(saGlobal + " is not defined", "warn");
      }
    } catch (error) {
      log(error.message, "warn");
    }
  };

  function collectLink(link) {
    let collect = false;

    // Collect download clicks
    if (
      optionsLink.downloads &&
      /^https?:\/\//i.test(link.href) &&
      new RegExp(
        "\\.(" + (optionsLink.downloadsExtensions || []).join("|") + ")$",
        "i"
      ).test(link.pathname)
    ) {
      collect = "download";

      // Collect outbound links clicks
    } else if (
      optionsLink.outbound &&
      link.hostname !== window.location.hostname
    ) {
      collect = "outbound";

      // Collect email clicks
    } else if (optionsLink.emails && /^mailto:/i.test(link.href)) {
      collect = "email";
    }

    if (!collect) return;

    const linkClickHandler = function (element) {
        saAutomatedLink(link, collect);
    }

    link.removeEventListener("click", linkClickHandler);
    link.addEventListener("click", linkClickHandler);
  }

  function registerLinkListeners() {
    try {
      let a = document.getElementsByTagName("a");

      // Loop over all links on the page
      for (let i = 0; i < a.length; i++) {
        let link = a[i];
        let href = link.getAttribute("href");

        // Skip links that don't have an href
        if (!href) continue;

        console.log(link)
          
        collectLink(link);
      }
    } catch (error) {
      log(error.message, "warn");
    }
  }

  const obsverver = new MutationObserver(() => {
      registerLinkListeners();
  })

  obsverver.observe(document.body, { childList: true, subtree: true });
})(window);