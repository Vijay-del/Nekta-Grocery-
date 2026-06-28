// ── SLIDER FIX — overrides broken initSlider in app-core.js ──
// Fixes: duplicate event listeners, SLIDES.length closure bug, curSlide reset

(function(){
  // Wait for DOM ready
  function fixSlider(){
    var _timer = null;
    var _drag  = {active:false, startX:0};
    var _cur   = 0;

    function getSlides(){
      return window._nkSlides || window._DEFAULT_SLIDES || [
        {bg:'linear-gradient(135deg,#059669,#047857)',tag:'⚡ DELIVERY IN 20 MINS',h:'Fresh Groceries\nAt Your Door',sub:"Kothagudem's fastest delivery",e:'🚴'},
        {bg:'linear-gradient(135deg,#f59e0b,#d97706)',tag:'🥛 DAIRY DEALS',h:'Fresh Milk\n@ ₹24 Only',sub:'Farm fresh, delivered daily',e:'🥛'},
        {bg:'linear-gradient(135deg,#ef4444,#dc2626)',tag:'🎉 MEGA SALE',h:'Flat 50% OFF\nOn Selected Items',sub:'Limited time offer - grab now!',e:'🛒'},
        {bg:'linear-gradient(135deg,#7c3aed,#6d28d9)',tag:'🍗 NON-VEG FRESH',h:'Chicken, Fish\n& Mutton Daily',sub:'Cleaned & ready to cook',e:'🍗'},
      ];
    }

    function startTimer(){
      if(_timer) clearInterval(_timer);
      _timer = setInterval(function(){
        var slides = getSlides();
        goSlide((_cur + 1) % slides.length);
      }, 4000);
    }

    function goSlide(n){
      _cur = n;
      // sync global curSlide used elsewhere
      window.curSlide = n;
      var scene = document.getElementById('pslider-scene');
      if(!scene) return;
      scene.style.transform = 'translateX(-' + (n * 100) + '%)';
      document.querySelectorAll('.pdot').forEach(function(d,i){
        d.classList.toggle('on', i === n);
      });
    }

    function initSlider(){
      var sl = document.getElementById('pslider');
      if(!sl) return;
      var SLIDES = getSlides();
      _cur = 0;
      window.curSlide = 0;

      // Clone to remove all old event listeners
      var fresh = sl.cloneNode(false);
      sl.parentNode.replaceChild(fresh, sl);
      var s2 = document.getElementById('pslider');

      var html = '<div class="pslider-scene" id="pslider-scene">';
      SLIDES.forEach(function(s, i){
        // If img URL provided — use it as full cover bg with dark overlay
        // If no img — use gradient bg only
        var bgStyle;
        if(s.img && s.img.trim()){
          bgStyle = 'background:url('+s.img.trim()+') center/cover no-repeat';
        } else {
          bgStyle = 'background:' + (s.bg || 'linear-gradient(135deg,#059669,#047857)');
        }
        html += '<div class="pslide" style="' + bgStyle + '">';
        // dark overlay so text is always readable
        html += '<div style="position:absolute;inset:0;background:rgba(0,0,0,'+(s.img?'.38':'.08')+');border-radius:24px"></div>';
        html += '<div style="color:#fff;z-index:1;position:relative;flex:1">';
        html += '<p style="font-size:10px;font-weight:800;letter-spacing:.8px;opacity:.9;margin-bottom:5px;background:rgba(255,255,255,.2);display:inline-block;padding:2px 10px;border-radius:20px">' + (s.tag||'') + '</p>';
        html += '<h2 style="font-size:22px;font-weight:900;line-height:1.2;font-family:\'Nunito\',sans-serif">' + (s.h||'').replace('\n','<br>') + '</h2>';
        html += '<p style="font-size:12px;margin-top:7px;opacity:.85">' + (s.sub||'') + '</p>';
        html += '<div style="margin-top:12px;background:rgba(255,255,255,.25);display:inline-block;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:800;color:#fff">Order Now</div>';
        html += '</div>';
        if(s.e && !s.img){
          html += '<div style="font-size:72px;opacity:.18;line-height:1;flex-shrink:0">' + s.e + '</div>';
        }
        html += '</div>';
      });
      html += '</div>';
      html += '<div class="pdots" id="pdots">';
      SLIDES.forEach(function(_, i){
        html += '<div class="pdot' + (i===0?' on':'') + '" onclick="window.goSlide(' + i + ')"></div>';
      });
      html += '</div>';
      s2.innerHTML = html;

      s2.addEventListener('touchstart', function(e){
        _drag.active = true;
        _drag.startX = e.touches[0].clientX;
        clearInterval(_timer);
      }, {passive:true});

      s2.addEventListener('touchend', function(e){
        if(!_drag.active) return;
        _drag.active = false;
        var dx = e.changedTouches[0].clientX - _drag.startX;
        var len = getSlides().length;
        if(Math.abs(dx) > 40){
          goSlide(dx < 0 ? (_cur+1)%len : (_cur-1+len)%len);
        }
        startTimer();
      }, {passive:true});

      startTimer();
    }

    // Override globals
    window.initSlider = initSlider;
    window.goSlide    = goSlide;

    // Run immediately
    initSlider();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', fixSlider);
  } else {
    fixSlider();
  }
})();
