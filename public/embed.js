/*
 * Contour Digital booking embed.
 *   <div data-contour-booking="discovery-call"></div>
 *   <script src="https://YOUR-APP/embed.js" async></script>
 * Replaces each placeholder with the booking calendar and keeps its height in sync.
 */
(function () {
  var script = document.currentScript;
  var origin = script ? new URL(script.src).origin : "";
  var frames = {};

  function mount() {
    var nodes = document.querySelectorAll("[data-contour-booking]:not([data-contour-mounted])");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var slug = el.getAttribute("data-contour-booking");
      var iframe = document.createElement("iframe");
      iframe.src = origin + "/embed/" + encodeURIComponent(slug);
      iframe.title = "Book an appointment";
      iframe.loading = "lazy";
      iframe.style.cssText = "width:100%;height:600px;border:0;display:block;overflow:hidden";
      iframe.setAttribute("scrolling", "no");
      el.setAttribute("data-contour-mounted", "1");
      el.appendChild(iframe);
      (frames[slug] = frames[slug] || []).push(iframe);
    }
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== "contour-booking:height") return;
    var list = frames[e.data.slug] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].contentWindow === e.source) list[i].style.height = Math.ceil(e.data.height) + "px";
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
