/**
 * game.js - "Map Explorer" Core Game Engine
 * Integrates Leaflet, OSRM Routing, and Vector Canvas drawing overlays.
 */

window.addEventListener('load', () => {
  // --- TOUR LEVEL PRESETS (Start & End GPS coordinates) ---
  const TOUR_PRESETS = {
    1: {
      name: "Paris Cruise",
      startName: "Arc de Triomphe, Paris",
      endName: "Eiffel Tower, Paris",
      start: [48.8738, 2.2950],
      end: [48.8584, 2.2945]
    },
    2: {
      name: "San Francisco Gate",
      startName: "Vista Point, SF",
      endName: "Presidio, SF",
      start: [37.8386, -122.4831],
      end: [37.7986, -122.4662]
    },
    3: {
      name: "Tokyo Neon",
      startName: "Tokyo Tower, Tokyo",
      endName: "Shibuya Crossing, Tokyo",
      start: [35.6586, 139.7454],
      end: [35.6595, 139.7006]
    },
    4: {
      name: "Rome Ancient",
      startName: "Colosseum, Rome",
      endName: "Vatican City, Rome",
      start: [41.8902, 12.4922],
      end: [41.9029, 12.4534]
    },
    5: {
      name: "Sydney Coast",
      startName: "Royal Botanic Garden, Sydney",
      endName: "Sydney Harbour Bridge",
      start: [-33.8642, 151.2166],
      end: [-33.8523, 151.2108]
    },
    6: {
      name: "London Royal",
      startName: "Buckingham Palace, London",
      endName: "Tower Bridge, London",
      start: [51.5014, -0.1419],
      end: [51.5055, -0.0754]
    },
    7: {
      name: "New York Night",
      startName: "Times Square, NYC",
      endName: "Metropolitan Museum of Art",
      start: [40.7580, -73.9855],
      end: [40.7794, -73.9632]
    },
    8: {
      name: "Cairo Sphinx",
      startName: "Great Sphinx of Giza",
      endName: "Great Pyramid of Giza",
      start: [29.9753, 31.1376],
      end: [29.9792, 31.1342]
    },
    9: {
      name: "Rio Heights",
      startName: "Copacabana Beach, Rio",
      endName: "Christ the Redeemer Lookout",
      start: [-22.9714, -43.1825],
      end: [-22.9519, -43.2105]
    },
    10: {
      name: "Jerusalem Garden",
      startName: "Mount of Olives, Jerusalem",
      endName: "Garden of Gethsemane",
      start: [31.7781, 35.2442],
      end: [31.7794, 35.2402]
    },
    11: {
      name: "Intramuros Manila Cruise",
      startName: "Fort Santiago, Manila, Philippines",
      endName: "Rizal Park, Manila, Philippines",
      start: [14.5937, 120.9701],
      end: [14.5826, 120.9790]
    },
    12: {
      name: "Auckland Sky Cruise",
      startName: "Auckland Harbour Bridge, New Zealand",
      endName: "Sky Tower, Auckland, New Zealand",
      start: [-36.8295, 174.7460],
      end: [-36.8485, 174.7622]
    },
    13: {
      name: "Free Exploration",
      startName: "Arc de Triomphe, Paris",
      endName: "Eiffel Tower, Paris",
      start: [48.8738, 2.2950],
      end: [48.8584, 2.2945],
      isExploratory: true
    }
  };

  // --- STATE VARIABLES ---
  let map = null;
  let carMarker = null;
  let teddyMarker = null;
  let scrollMarker = null;
  let routePolyline = null;
  let gameStarted = false;
  let lastTimestamp = 0;
  let lastCameraPanTime = 0;
  let isCameraLocked = true;
  
  let routePoints = []; // List of L.LatLng
  let currentTargetIndex = 0;
  
  // Navigation Banner State
  let routeSteps = [];
  let activeStepIndex = 0;
  let isPreviewMode = false;
  
  // Custom marker canvas references
  let carCanvasCtx = null;
  let teddyCanvasCtx = null;
  let scrollCanvasCtx = null;

  // Car Animation parameters
  const car = {
    lat: 0,
    lng: 0,
    angle: 0,
    targetAngle: 0,
    isHonking: false,
    honkTimer: 0,
    speedFactor: 5,
    isAutopilot: false
  };
  
  // Drive-to-step: when user swipes banner, car drives to that step then stops
  let driveToStepIndex = -1; // -1 means no active drive-to target

  // Keyboard controls
  const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
  };

  // Joystick state
  const joystick = {
    active: false,
    dx: 0,
    dy: 0,
    maxDist: 50
  };

  // Quest states - init once on first load
  let questState = Puzzles.init();
  let scrollCoordinateIndex = 0;
  let activeSpeechTimer = 0;
  let isFirstFloor = true;
  
  // Music synthesis variables
  let audioCtx = null;
  let musicPlaying = true;
  let musicTimer = null;
  let melodyStep = 0;

  const musicMelody = [
    261.63, 329.63, 392.00, 440.00, 523.25, 440.00, 392.00, 329.63,
    293.66, 349.23, 440.00, 523.25, 587.33, 523.25, 440.00, 349.23
  ];

  // --- LEAFLET INITIALIZATION ---
  function initMap(centerLat, centerLng) {
    if (map) {
      map.remove();
    }

    // Set map style: Standard Light Positron vs Night dark matter based on floor
    const floor = Puzzles.currentFloor;
    let mapTileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    
    if (floor >= 7 && floor <= 9) {
      mapTileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    }

    map = L.map('map', {
      center: [centerLat, centerLng],
      zoom: 16,
      zoomControl: false
    });

    L.tileLayer(mapTileUrl, {
      attribution: '&copy; CartoDB &copy; OpenStreetMap'
    }).addTo(map);
  }

  // --- VECTOR CANVAS MARKER FACTORY ---
  function createCarMarker(lat, lng) {
    const size = 60;
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    carCanvasCtx = canvas.getContext('2d');

    carMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: canvas,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        className: 'car-marker-container'
      }),
      zIndexOffset: 1000
    }).addTo(map);
  }

  function createTeddyMarker(lat, lng) {
    const size = 50;
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    teddyCanvasCtx = canvas.getContext('2d');

    teddyMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: canvas,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        className: 'teddy-marker-container'
      })
    }).addTo(map);
  }

  function createScrollMarker(lat, lng) {
    const size = 45;
    const canvas = document.createElement('canvas');
    canvas.width = size * 2;
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    scrollCanvasCtx = canvas.getContext('2d');

    scrollMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        html: canvas,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        className: 'scroll-marker-container'
      })
    }).addTo(map);
  }

  // --- GEOGRAPHIC UTILITIES ---
  function getBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    return Math.atan2(y, x);
  }

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const deltaPhi = (lat2-lat1) * Math.PI/180;
    const deltaLambda = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // Smoothly interpolate angle to avoid jerky rotation
  function lerpAngle(from, to, t) {
    let diff = to - from;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return from + diff * t;
  }

  // --- OSRM ROUTE GENERATOR ---
  function mapManeuverIcon(type, modifier) {
    if (type === 'arrive') return '🏁';
    if (type === 'depart') return '🚀';
    if (type === 'roundabout') return '↻';
    if (type === 'merge') return '⇢';
    
    if (modifier === 'left') return '↰';
    if (modifier === 'right') return '↱';
    if (modifier === 'slight left') return '↖';
    if (modifier === 'slight right') return '↗';
    if (modifier === 'sharp left') return '⤹';
    if (modifier === 'sharp right') return '⤸';
    
    if (type === 'continue' || modifier === 'straight') return '↑';
    return '➤';
  }

  async function generateRoute(startCoords, endCoords) {
    try {
      updateInstructionText("🛰 GPS: Querying routing network coordinates...");
      const url = `https://router.project-osrm.org/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson&steps=true`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data && data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates;
        routePoints = coords.map(c => L.latLng(c[1], c[0]));
        
        if (data.routes[0].legs && data.routes[0].legs.length > 0) {
          const steps = data.routes[0].legs[0].steps;
          routeSteps = steps.map(step => {
            const maneuver = step.maneuver;
            let icon = mapManeuverIcon(maneuver.type, maneuver.modifier);
            let instruction = maneuver.type;
            if (step.name) {
              instruction += " onto " + step.name;
            } else if (maneuver.type === "arrive") {
              instruction = "Arrive at destination";
            }
            return {
              instruction: instruction.charAt(0).toUpperCase() + instruction.slice(1),
              maneuverType: maneuver.type,
              modifier: maneuver.modifier,
              distance: step.distance,
              duration: step.duration,
              location: [maneuver.location[1], maneuver.location[0]], // [lat, lng]
              icon: icon
            };
          });
        } else {
          routeSteps = [];
        }
        
        drawRouteOnMap();
        return true;
      }
    } catch (e) {
      console.warn("OSRM Router request failed. Using straight path fallback.", e);
    }
    
    // Offline fallback: straight interpolation
    routePoints = [];
    routeSteps = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat = startCoords[0] + (endCoords[0] - startCoords[0]) * t;
      const lng = startCoords[1] + (endCoords[1] - startCoords[1]) * t;
      routePoints.push(L.latLng(lat, lng));
    }
    drawRouteOnMap();
    return true;
  }

  function drawRouteOnMap() {
    if (routePolyline) {
      routePolyline.remove();
    }
    
    routePolyline = L.polyline(routePoints, {
      color: '#38bdf8',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    // Scripture Scroll at ~45% of the route (only for non-exploratory floors)
    const tour = TOUR_PRESETS[Puzzles.currentFloor] || TOUR_PRESETS[1];
    if (!tour.isExploratory) {
      scrollCoordinateIndex = Math.floor(routePoints.length * 0.45);
      const scrollPos = routePoints[scrollCoordinateIndex];
      
      if (scrollMarker) scrollMarker.remove();
      createScrollMarker(scrollPos.lat, scrollPos.lng);
    } else {
      if (scrollMarker) {
        scrollMarker.remove();
        scrollMarker = null;
      }
    }

    // Place car at start
    currentTargetIndex = 1; // start heading toward the second point
    car.lat = routePoints[0].lat;
    car.lng = routePoints[0].lng;
    
    // Compute initial bearing aligned to screen cartesian (0 rad is East)
    if (routePoints.length > 1) {
      car.angle = getBearing(car.lat, car.lng, routePoints[1].lat, routePoints[1].lng) - Math.PI / 2;
      car.targetAngle = car.angle;
    }
    
    carMarker.setLatLng([car.lat, car.lng]);
    map.setView([car.lat, car.lng], 16, { animate: false });
    
    // Keep autopilot in its current user-chosen state
    document.getElementById("autopilot-toggle").checked = car.isAutopilot;
    driveToStepIndex = -1;
    
    updateInstructionText(car.isAutopilot
      ? "🛰 GPS Route Ready! Auto-Pilot is driving. Use joystick to steer manually."
      : "🛰 GPS Route Ready! Swipe the nav banner to drive to a turn, or enable Auto-Pilot.");
    
    if (routeSteps.length > 0) {
      renderNavBanner(routeSteps);
    } else {
      hideNavBanner();
    }
  }

  // --- NAVIGATION BANNER MANAGEMENT ---
  function renderNavBanner(steps) {
    const track = document.getElementById('nav-banner-track');
    const banner = document.getElementById('nav-banner');
    const hudInstructions = document.getElementById('gps-instructions-hud');
    
    track.innerHTML = '';
    activeStepIndex = 0;
    isPreviewMode = false;
    
    steps.forEach((step, index) => {
      const card = document.createElement('div');
      card.className = 'nav-card';
      card.dataset.stepIndex = index;
      if (index === 0) card.classList.add('active');
      
      let distanceText = step.distance > 1000 
        ? (step.distance / 1000).toFixed(1) + ' km'
        : Math.round(step.distance) + ' m';
        
      if (step.distance === 0) distanceText = '';
      
      card.innerHTML = `
        <div class="nav-card-icon">${step.icon}</div>
        <div class="nav-card-details">
          <div class="nav-card-street">${step.instruction}</div>
          <div class="nav-card-distance">${distanceText}</div>
        </div>
        <div class="nav-card-counter">${index + 1} / ${steps.length}</div>
      `;
      track.appendChild(card);
    });
    
    banner.style.display = 'flex';
    hudInstructions.style.display = 'none';
    document.getElementById('nav-recenter-btn').style.display = 'none';
    
    // Add scroll event listener
    track.addEventListener('scroll', onBannerScroll);
    initBannerDrag(track);
  }

  // Mouse drag-to-scroll state
  let isDraggingBanner = false;
  let bannerStartX = 0;
  let bannerScrollLeft = 0;

  function initBannerDrag(track) {
    track.onmousedown = (e) => {
      isDraggingBanner = true;
      track.style.scrollSnapType = 'none'; // Temporarily disable snap during drag
      track.style.cursor = 'grabbing';
      bannerStartX = e.pageX - track.offsetLeft;
      bannerScrollLeft = track.scrollLeft;
    };
    
    track.onmouseleave = () => {
      if (isDraggingBanner) {
        isDraggingBanner = false;
        track.style.scrollSnapType = 'x mandatory';
        track.style.cursor = 'default';
        onBannerScroll();
      }
    };
    
    track.onmouseup = () => {
      isDraggingBanner = false;
      track.style.scrollSnapType = 'x mandatory';
      track.style.cursor = 'default';
      onBannerScroll();
    };
    
    track.onmousemove = (e) => {
      if (!isDraggingBanner) return;
      e.preventDefault();
      const x = e.pageX - track.offsetLeft;
      const walk = (x - bannerStartX) * 1.5; // Drag speed multiplier
      track.scrollLeft = bannerScrollLeft - walk;
    };
  }

  function hideNavBanner() {
    const banner = document.getElementById('nav-banner');
    const hudInstructions = document.getElementById('gps-instructions-hud');
    
    banner.style.display = 'none';
    hudInstructions.style.display = 'flex';
    
    const track = document.getElementById('nav-banner-track');
    track.removeEventListener('scroll', onBannerScroll);
  }

  function scrollToStep(index) {
    const track = document.getElementById('nav-banner-track');
    const cards = track.querySelectorAll('.nav-card');
    if (cards[index]) {
      // Temporarily disable scroll listener to prevent it from triggering preview mode
      track.removeEventListener('scroll', onBannerScroll);
      
      cards.forEach(c => c.classList.remove('active'));
      cards[index].classList.add('active');
      
      // Calculate scroll position to center the card
      const trackWidth = track.clientWidth;
      const cardLeft = cards[index].offsetLeft;
      const cardWidth = cards[index].offsetWidth;
      track.scrollTo({
        left: cardLeft - (trackWidth / 2) + (cardWidth / 2),
        behavior: 'smooth'
      });
      
      // Re-enable after smooth scroll
      setTimeout(() => {
        track.addEventListener('scroll', onBannerScroll);
      }, 300);
    }
  }

  let scrollTimeout = null;
  function onBannerScroll() {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      const track = document.getElementById('nav-banner-track');
      const cards = track.querySelectorAll('.nav-card');
      const trackCenter = track.scrollLeft + (track.clientWidth / 2);
      
      let closestIndex = 0;
      let minDistance = Infinity;
      
      cards.forEach((card, index) => {
        const cardCenter = card.offsetLeft + (card.offsetWidth / 2);
        const dist = Math.abs(cardCenter - trackCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = index;
        }
      });
      
      cards.forEach(c => c.classList.remove('active'));
      cards[closestIndex].classList.add('active');
      
      if (closestIndex !== activeStepIndex && closestIndex > activeStepIndex) {
        // User swiped forward — drive the car to this step at current speed
        driveToStepIndex = closestIndex;
        isPreviewMode = false;
        
        // Enable autopilot to drive there
        car.isAutopilot = true;
        document.getElementById('autopilot-toggle').checked = true;
        
        // Keep camera locked on the car while it drives
        isCameraLocked = true;
        document.getElementById('camera-lock-btn').classList.add('active');
        document.getElementById('camera-snap-btn').classList.remove('active');
        
        updateInstructionText(`🚗 Driving to step ${closestIndex + 1}...`);
      } else if (closestIndex < activeStepIndex) {
        // User swiped backward — just preview (can't drive backwards)
        isPreviewMode = true;
        document.getElementById('nav-recenter-btn').style.display = 'block';
        
        const step = routeSteps[closestIndex];
        if (step && step.location) {
          map.flyTo(step.location, 17, { animate: true, duration: 1.5 });
          isCameraLocked = false;
          document.getElementById('camera-lock-btn').classList.remove('active');
          document.getElementById('camera-snap-btn').classList.add('active');
        }
      }
    }, 150); // Debounce to wait for scroll snap to finish
  }

  function syncStepWithCarPosition() {
    if (routeSteps.length === 0 || isPreviewMode) return;
    
    // Find which step we are currently heading towards
    let nextStepIndex = activeStepIndex;
    
    // Check if we passed the active step
    if (activeStepIndex < routeSteps.length - 1) {
      const currentStep = routeSteps[activeStepIndex];
      const distToCurrentStep = getDistance(car.lat, car.lng, currentStep.location[0], currentStep.location[1]);
      
      // If we are very close to or have passed the current step coordinate, advance
      if (distToCurrentStep < 15) {
        nextStepIndex = activeStepIndex + 1;
      }
    }
    
    if (nextStepIndex !== activeStepIndex) {
      activeStepIndex = nextStepIndex;
      scrollToStep(activeStepIndex);
      
      // If we've reached the drive-to target step, stop autopilot
      if (driveToStepIndex >= 0 && activeStepIndex >= driveToStepIndex) {
        driveToStepIndex = -1;
        car.isAutopilot = false;
        document.getElementById('autopilot-toggle').checked = false;
        updateInstructionText('🛰 Arrived at step! Swipe the banner to drive to the next turn.');
      }
    }
  }

  // Add event listener for recenter button
  document.getElementById('nav-recenter-btn').addEventListener('click', () => {
    isPreviewMode = false;
    driveToStepIndex = -1;
    document.getElementById('nav-recenter-btn').style.display = 'none';
    scrollToStep(activeStepIndex);
    
    isCameraLocked = true;
    document.getElementById('camera-lock-btn').classList.add('active');
    document.getElementById('camera-snap-btn').classList.remove('active');
    
    map.flyTo([car.lat, car.lng], 16, { animate: true, duration: 1 });
  });

  // --- GAME LOGIC LOOP ---
  function update(dt) {
    if (routePoints.length === 0) return;

    // Compute manual input vector from keyboard + joystick
    let inputX = 0;
    let inputY = 0;
    if (keys.a || keys.ArrowLeft) inputX -= 1;
    if (keys.d || keys.ArrowRight) inputX += 1;
    if (keys.w || keys.ArrowUp) inputY -= 1;
    if (keys.s || keys.ArrowDown) inputY += 1;

    if (joystick.active) {
      inputX = joystick.dx;
      inputY = joystick.dy;
    }

    const hasManualInput = Math.abs(inputX) > 0.1 || Math.abs(inputY) > 0.1;

    // Compute the movement speed in degrees (scaled realistically by speedFactor & dt)
    // 0.00000006 degrees per ms gives a perfect driving pace of ~50-80 km/h
    const moveSpeed = car.speedFactor * 0.00000006 * dt;

    if (car.isAutopilot && !hasManualInput && questState.stage === "explore") {
      // --- AUTOPILOT MODE ---
      let distanceLeftToMove = moveSpeed;
      
      while (distanceLeftToMove > 0 && currentTargetIndex < routePoints.length) {
        const target = routePoints[currentTargetIndex];
        
        // Compute Euclidean step distance in degrees
        const stepLat = target.lat - car.lat;
        const stepLng = target.lng - car.lng;
        const stepDist = Math.sqrt(stepLat * stepLat + stepLng * stepLng);
        
        if (stepDist === 0) {
          currentTargetIndex++;
          continue;
        }
        
        if (distanceLeftToMove >= stepDist) {
          // We have enough speed to fully reach and surpass this node!
          car.lat = target.lat;
          car.lng = target.lng;
          distanceLeftToMove -= stepDist;
          if (currentTargetIndex < routePoints.length - 1) {
            currentTargetIndex++;
          } else {
            break; // Reached end of route
          }
        } else {
          // Move a fraction of the way towards the target
          const fraction = distanceLeftToMove / stepDist;
          car.lat += stepLat * fraction;
          car.lng += stepLng * fraction;
          distanceLeftToMove = 0;
        }
      }
      
      // Update target bearing based on current target node
      if (currentTargetIndex < routePoints.length) {
        const target = routePoints[currentTargetIndex];
        car.targetAngle = getBearing(car.lat, car.lng, target.lat, target.lng) - Math.PI / 2;
      }
    } else if (hasManualInput && questState.stage === "explore") {
      // --- MANUAL JOYSTICK / KEYBOARD MODE ---
      const manualAngle = Math.atan2(inputY, inputX);
      car.targetAngle = manualAngle;
      
      // Manual speed is designed to be slightly slower (60%) for supreme driving precision
      const manualMoveSpeed = moveSpeed * 0.6;
      const magnitude = Math.min(Math.sqrt(inputX * inputX + inputY * inputY), 1);
      car.lat += Math.sin(manualAngle) * manualMoveSpeed * magnitude * -1;
      car.lng += Math.cos(manualAngle) * manualMoveSpeed * magnitude;

      // Snap the autopilot's currentTargetIndex to the nearest route node
      // so when switching back to autopilot, it picks up correctly
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < routePoints.length; i++) {
        const d = getDistance(car.lat, car.lng, routePoints[i].lat, routePoints[i].lng);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      currentTargetIndex = Math.min(bestIdx + 1, routePoints.length - 1);
    }
    
    // Sync the turn-by-turn banner with current location
    syncStepWithCarPosition();

    // Smooth angle interpolation (avoid jerky rotation)
    car.angle = lerpAngle(car.angle, car.targetAngle, Math.min(1, 8 * dt / 1000));

    // Update marker position (no expensive map animation)
    carMarker.setLatLng([car.lat, car.lng]);
    
    // Smoothly pan camera to follow car (throttled at 150ms with 250ms hardware-accelerated pan)
    const nowTime = performance.now();
    if (isCameraLocked && nowTime - lastCameraPanTime > 150) {
      lastCameraPanTime = nowTime;
      map.panTo([car.lat, car.lng], { animate: true, duration: 0.25 });
    }

    // Honk anim decrement
    if (car.isHonking) {
      car.honkTimer--;
      if (car.honkTimer <= 0) car.isHonking = false;
    }

    // Proximity trigger logic
    if (questState.stage === "explore") {
      const tour = TOUR_PRESETS[Puzzles.currentFloor] || TOUR_PRESETS[1];
      if (tour.isExploratory) {
        const destination = routePoints[routePoints.length - 1];
        const distToDest = getDistance(car.lat, car.lng, destination.lat, destination.lng);
        
        updateInstructionText(`🏁 Drive to the destination! (${Math.round(distToDest)}m away)`);
        
        if (distToDest < 25) {
          if (!car.hasReachedExploratoryDest) {
            car.hasReachedExploratoryDest = true;
            triggerSpeech("mayor", "Hooray! You reached the destination! Type any new locations in the GPS panel to keep exploring!");
          }
        } else {
          if (distToDest > 40) {
            car.hasReachedExploratoryDest = false;
          }
        }
      } else {
        // 1. Scripture Scroll Collection check
        if (!questState.scrollCollected) {
          const scrollPos = routePoints[scrollCoordinateIndex];
          const distToScroll = getDistance(car.lat, car.lng, scrollPos.lat, scrollPos.lng);
          
          updateInstructionText(`📜 Drive to Scripture Scroll! (${Math.round(distToScroll)}m away)`);
          
          if (distToScroll < 25) {
            questState.scrollCollected = true;
            questState.stage = "scroll_popup";
            
            Puzzles.showScriptureCard(() => {
              triggerSpeech("mayor", "Fantastic! You memorized the scripture. Now drive to the destination and talk to me!");
              questState.stage = "explore";
              Puzzles.updateHUD();
            });
          }
        } 
        // 2. Mayor Destination arrival check
        else {
          const destination = routePoints[routePoints.length - 1];
          const distToTeddy = getDistance(car.lat, car.lng, destination.lat, destination.lng);
          
          updateInstructionText(`🐻 Drive to Mayor Teddy at the destination! (${Math.round(distToTeddy)}m away)`);
  
          if (distToTeddy < 25) {
            questState.stage = "solving";
  
            Puzzles.showInteractivePuzzle((success) => {
              if (success) {
                questState.stage = "ready_for_next";
                
                setTimeout(() => {
                  Puzzles.clearFloor((isVictory) => {
                    if (!isVictory) {
                      // clearFloor already incremented currentFloor
                      generateFloor();
                    }
                  });
                }, 1200);
              } else {
                // Let them try again
                questState.stage = "explore";
              }
            });
          }
        }
      }
    }

    // Dialog fade countdown
    if (activeSpeechTimer > 0) {
      activeSpeechTimer--;
      if (activeSpeechTimer === 0) {
        document.getElementById("dialog-overlay").classList.remove("active");
      }
    }
  }

  // --- VECTOR DRAW CALLS TICK ---
  function draw() {
    // Redraw Cartoon Custom Car
    if (carCanvasCtx) {
      carCanvasCtx.clearRect(0, 0, 120, 120);
      Assets.drawCar(
        carCanvasCtx, 
        60, 60, 
        car.angle,
        Puzzles.carPaint, 
        car.isHonking, 
        1.1, 
        Puzzles.carAccessory
      );
    }

    // Redraw Mayor Teddy Destination
    if (teddyCanvasCtx) {
      teddyCanvasCtx.clearRect(0, 0, 100, 100);
      const scale = 1.0 + (questState.scrollCollected ? Math.sin(Date.now() * 0.008) * 0.05 : 0);
      Assets.drawTeddy(teddyCanvasCtx, 50, 50, scale);
    }

    // Redraw Floating Gold Scroll
    if (scrollCanvasCtx && scrollMarker && !questState.scrollCollected) {
      scrollCanvasCtx.clearRect(0, 0, 90, 90);
      Assets.drawScroll(scrollCanvasCtx, 45, 45, 1.15);
    } else if (scrollMarker && questState.scrollCollected) {
      scrollMarker.remove();
      scrollMarker = null;
    }
  }

  // --- LOOP ANIMATION FRAME TICKER ---
  function gameTick(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(timestamp - lastTimestamp, 100); // cap delta to 100ms
    lastTimestamp = timestamp;

    update(dt);
    draw();
    requestAnimationFrame(gameTick);
  }

  // --- TOUR GENERATOR BY FLOOR ---
  async function generateFloor() {
    const floor = Puzzles.currentFloor;
    
    // On the very first floor, Puzzles.init() was already called.
    // On subsequent floors, Puzzles.clearFloor() already incremented 
    // currentFloor and set up a new scripture. We just need to reset quest state.
    if (isFirstFloor) {
      isFirstFloor = false;
    } else {
      // Reset quest tracking for the new floor without resetting currentFloor
      Puzzles.activeQuest = {
        scrollCollected: false,
        stage: "explore"
      };
      Puzzles.selectRandomScripture();
    }
    
    questState = Puzzles.activeQuest;
    Puzzles.updateHUD();
    
    const tour = TOUR_PRESETS[floor] || TOUR_PRESETS[1];

    updateInstructionText(`🔍 Loading tour: ${tour.name}...`);
    
    // Reinitialize leaflet tiles style based on floor
    initMap(tour.start[0], tour.start[1]);

    // Clean up old markers
    if (carMarker) { carMarker.remove(); carMarker = null; }
    if (teddyMarker) { teddyMarker.remove(); teddyMarker = null; }
    if (scrollMarker) { scrollMarker.remove(); scrollMarker = null; }

    // Create markers at exact locations
    createCarMarker(tour.start[0], tour.start[1]);
    createTeddyMarker(tour.end[0], tour.end[1]);

    // Fetch routing geometry
    await generateRoute(tour.start, tour.end);

    // Sync input boxes
    document.getElementById("start-search-input").value = tour.startName;
    document.getElementById("end-search-input").value = tour.endName;

    triggerSpeech("mayor", `Welcome to Floor ${floor}: ${tour.name}! Let's navigate to ${tour.endName}!`);
    initSequencer();
  }

  // --- SEARCH AND GEOCODING HANDLERS ---
  async function geocodeAddress(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch(e) {
      console.warn("Geocoding failed", e);
    }
    return null;
  }

  async function calculateCustomRoute() {
    const startVal = document.getElementById("start-search-input").value;
    const endVal = document.getElementById("end-search-input").value;

    updateInstructionText("🛰 GPS: Geocoding custom search coordinates...");
    
    const startCoords = await geocodeAddress(startVal);
    const endCoords = await geocodeAddress(endVal);

    if (startCoords && endCoords) {
      map.panTo(startCoords, { animate: false });
      
      if (carMarker) carMarker.remove();
      if (teddyMarker) teddyMarker.remove();

      createCarMarker(startCoords[0], startCoords[1]);
      createTeddyMarker(endCoords[0], endCoords[1]);

      await generateRoute(startCoords, endCoords);
    } else {
      updateInstructionText("❌ GPS Error: Could not locate locations. Try a different city.");
    }
  }

  // --- AUDIO BGM FLUTE SEQUENCE ---
  function initSequencer() {
    if (musicTimer) return;
    musicTimer = setInterval(() => {
      if (!musicPlaying) return;
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.type = "triangle";
        const freq = musicMelody[melodyStep % musicMelody.length];
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0.025, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);

        melodyStep++;
      } catch (e) {}
    }, 450);
  }

  // --- KEYBOARD EVENT LISTENERS ---
  window.addEventListener('keydown', e => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    if (e.key === ' ' || e.key === 'h' || e.key === 'H') {
      triggerHonk();
    }
  });

  window.addEventListener('keyup', e => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
  });

  // --- JOYSTICK SETUP ---
  const joystickContainer = document.getElementById('joystick-container');
  const joystickKnob = document.getElementById('joystick-knob');

  joystickContainer.addEventListener('mousedown', startDrag);
  joystickContainer.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    e.preventDefault();
    joystick.active = true;
    const rect = joystickContainer.getBoundingClientRect();
    joystick.startX = rect.left + rect.width / 2;
    joystick.startY = rect.top + rect.height / 2;

    window.addEventListener('mousemove', drag);
    window.addEventListener('touchmove', drag, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
  }

  function drag(e) {
    if (!joystick.active) return;
    let clientX, clientY;
    if (e.touches && e.touches[0]) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    let dx = clientX - joystick.startX;
    let dy = clientY - joystick.startY;
    let distance = Math.hypot(dx, dy);

    if (distance > joystick.maxDist) {
      dx = (dx / distance) * joystick.maxDist;
      dy = (dy / distance) * joystick.maxDist;
    }

    joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    joystick.dx = dx / joystick.maxDist;
    joystick.dy = dy / joystick.maxDist;
  }

  function endDrag() {
    joystick.active = false;
    joystickKnob.style.transform = 'translate(0px, 0px)';
    joystick.dx = 0;
    joystick.dy = 0;

    window.removeEventListener('mousemove', drag);
    window.removeEventListener('touchmove', drag);
    window.removeEventListener('mouseup', endDrag);
    window.removeEventListener('touchend', endDrag);
  }

  // --- HONK ---
  function triggerHonk() {
    if (car.isHonking) return;
    car.isHonking = true;
    car.honkTimer = 18;

    try {
      const synthCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = synthCtx.createOscillator();
      const gainNode = synthCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(synthCtx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(329.63, synthCtx.currentTime);
      osc.frequency.setValueAtTime(392.00, synthCtx.currentTime + 0.08);
      gainNode.gain.setValueAtTime(0.08, synthCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, synthCtx.currentTime + 0.25);
      osc.start();
      osc.stop(synthCtx.currentTime + 0.25);
    } catch (e) {}
  }

  // --- UI BINDINGS ---
  const startBtn = document.getElementById('start-btn');
  const splashScreen = document.getElementById('splash-screen');
  const tourSelect = document.getElementById('tour-select');
  const surpriseBtn = document.getElementById('surprise-btn');
  const dashboardToggle = document.getElementById('dashboard-toggle-btn');
  const gpsDashboard = document.getElementById('gps-dashboard');
  const calculateBtn = document.getElementById('calculate-route-btn');
  const startSearchBtn = document.getElementById('start-search-btn');
  const endSearchBtn = document.getElementById('end-search-btn');

  const autopilotToggle = document.getElementById('autopilot-toggle');
  const speedSlider = document.getElementById('speed-range');
  const speedX2Btn = document.getElementById('speed-x2-btn');
  const speedX5Btn = document.getElementById('speed-x5-btn');
  const honkBtn = document.getElementById('honk-btn');
  const muteBtn = document.getElementById('mute-btn');
  const garageBtn = document.getElementById('garage-btn');
  const closeGarageBtn = document.getElementById('close-garage-btn');
  const garageOverlay = document.getElementById('garage-overlay');
  const cameraLockBtn = document.getElementById('camera-lock-btn');
  const cameraSnapBtn = document.getElementById('camera-snap-btn');

  const floorHud = document.getElementById('floor-hud');
  const floorSelectOverlay = document.getElementById('floor-select-overlay');
  const floorSelectCloseBtnTop = document.getElementById('floor-select-close-btn-top');
  const closeFloorSelectBtn = document.getElementById('close-floor-select-btn');

  startBtn.addEventListener('click', () => {
    splashScreen.classList.add('hidden');
    Puzzles.playRewardSound(true);
    
    const floor = parseInt(tourSelect.value);
    Puzzles.currentFloor = floor;
    
    generateFloor();
    if (!gameStarted) {
      gameStarted = true;
      requestAnimationFrame(gameTick);
    }
  });

  surpriseBtn.addEventListener('click', () => {
    const randomFloor = Math.floor(Math.random() * 12) + 1;
    tourSelect.value = randomFloor;
    Puzzles.playRewardSound(true);
  });

  const gpsToggleBtn = document.getElementById('gps-toggle-btn');

  dashboardToggle.addEventListener('click', () => {
    gpsDashboard.classList.toggle('collapsed');
    const isCollapsed = gpsDashboard.classList.contains('collapsed');
    dashboardToggle.textContent = isCollapsed ? "▲ Show Panel" : "▼ Hide Panel";
    gpsToggleBtn.style.display = isCollapsed ? "block" : "none";
  });

  gpsToggleBtn.addEventListener('click', () => {
    gpsDashboard.classList.remove('collapsed');
    dashboardToggle.textContent = "▼ Hide Panel";
    gpsToggleBtn.style.display = "none";
    Puzzles.playRewardSound(true);
  });

  calculateBtn.addEventListener('click', calculateCustomRoute);
  startSearchBtn.addEventListener('click', calculateCustomRoute);
  endSearchBtn.addEventListener('click', calculateCustomRoute);

  autopilotToggle.addEventListener('change', (e) => {
    car.isAutopilot = e.target.checked;
  });

  // Speed synchronizer with active state highlighting
  function updateSpeedUI(factor) {
    car.speedFactor = factor;
    speedSlider.value = factor;
    
    if (factor === 2) {
      speedX2Btn.classList.add('active');
      speedX5Btn.classList.remove('active');
    } else if (factor === 5) {
      speedX2Btn.classList.remove('active');
      speedX5Btn.classList.add('active');
    } else {
      speedX2Btn.classList.remove('active');
      speedX5Btn.classList.remove('active');
    }
  }

  speedSlider.addEventListener('input', (e) => {
    updateSpeedUI(parseInt(e.target.value));
  });

  speedX2Btn.addEventListener('click', () => {
    updateSpeedUI(2);
    Puzzles.playRewardSound(true);
  });

  speedX5Btn.addEventListener('click', () => {
    updateSpeedUI(5);
    Puzzles.playRewardSound(true);
  });

  honkBtn.addEventListener('click', triggerHonk);

  cameraLockBtn.addEventListener('click', () => {
    isCameraLocked = !isCameraLocked;
    if (isCameraLocked) {
      cameraLockBtn.classList.add('active');
      cameraLockBtn.textContent = "🔒 Lock Cam";
      // Snap immediately upon locking
      map.panTo([car.lat, car.lng], { animate: true, duration: 0.25 });
    } else {
      cameraLockBtn.classList.remove('active');
      cameraLockBtn.textContent = "🔓 Free Cam";
    }
    Puzzles.playRewardSound(true);
  });

  cameraSnapBtn.addEventListener('click', () => {
    map.panTo([car.lat, car.lng], { animate: true, duration: 0.35 });
    Puzzles.playRewardSound(true);
  });

  muteBtn.addEventListener('click', () => {
    musicPlaying = !musicPlaying;
    muteBtn.textContent = musicPlaying ? "🎵 Music: ON" : "🔇 Music: OFF";
    muteBtn.style.background = musicPlaying ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
  });

  garageBtn.addEventListener('click', () => {
    garageOverlay.classList.add('active');
  });

  closeGarageBtn.addEventListener('click', () => {
    garageOverlay.classList.remove('active');
  });

  const closeGarageBtnTop = document.getElementById('garage-close-btn-top');
  if (closeGarageBtnTop) {
    closeGarageBtnTop.addEventListener('click', () => {
      garageOverlay.classList.remove('active');
    });
  }

  // Victory screen close
  const victoryCloseBtn = document.getElementById('victory-close-btn');
  if (victoryCloseBtn) {
    victoryCloseBtn.addEventListener('click', () => {
      document.getElementById('victory-overlay').classList.remove('active');
    });
  }

  // Dynamic Floor Selector UI List
  function initFloorSelectorUI() {
    const listContainer = document.getElementById("floor-selection-list");
    listContainer.innerHTML = "";
    
    for (let f = 1; f <= 13; f++) {
      const tour = TOUR_PRESETS[f];
      const btn = document.createElement("button");
      btn.style.width = "100%";
      btn.style.fontFamily = "var(--font-family)";
      btn.style.fontSize = "1.05rem";
      btn.style.fontWeight = "700";
      btn.style.color = f === Puzzles.currentFloor ? "white" : "#1e293b";
      btn.style.background = f === Puzzles.currentFloor 
        ? "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)" 
        : "rgba(255, 255, 255, 0.9)";
      btn.style.border = f === Puzzles.currentFloor 
        ? "3px solid white" 
        : "3px solid #cbd5e1";
      btn.style.borderRadius = "16px";
      btn.style.padding = "12px 16px";
      btn.style.cursor = "pointer";
      btn.style.textAlign = "left";
      btn.style.boxShadow = "var(--shadow)";
      btn.style.transition = "transform 0.15s, background 0.15s";
      
      btn.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: none;">
          <span>Floor ${f}: ${tour.name}</span>
          <span style="font-size: 0.9rem; opacity: 0.85;">${f === Puzzles.currentFloor ? "★ Active" : "Go ➔"}</span>
        </div>
      `;
      
      btn.addEventListener("mouseenter", () => { btn.style.transform = "scale(1.02)"; });
      btn.addEventListener("mouseleave", () => { btn.style.transform = "scale(1.0)"; });
      
      btn.addEventListener("click", () => {
        Puzzles.currentFloor = f;
        Puzzles.selectRandomScripture();
        isFirstFloor = true; // Force full load of start/end presets
        generateFloor();
        Puzzles.playRewardSound(true);
        floorSelectOverlay.classList.remove("active");
      });
      
      listContainer.appendChild(btn);
    }
  }

  // Bind Floor HUD button clicks
  floorHud.addEventListener('click', () => {
    initFloorSelectorUI();
    floorSelectOverlay.classList.add('active');
  });

  closeFloorSelectBtn.addEventListener('click', () => {
    floorSelectOverlay.classList.remove('active');
  });

  if (floorSelectCloseBtnTop) {
    floorSelectCloseBtnTop.addEventListener('click', () => {
      floorSelectOverlay.classList.remove('active');
    });
  }

  // --- DYNAMIC DIALOG SPEECH ---
  function triggerSpeech(npcId, text) {
    activeSpeechTimer = 180;
    const dialogEl = document.getElementById("dialog-overlay");
    const nameEl = document.getElementById("npc-title");
    const textEl = document.getElementById("npc-speech");
    const avatarCanvas = document.getElementById("npc-avatar-canvas");
    
    nameEl.textContent = "Mayor Teddy";
    textEl.textContent = text;
    dialogEl.classList.add("active");

    const aCtx = avatarCanvas.getContext('2d');
    aCtx.clearRect(0,0,90,90);
    Assets.drawTeddy(aCtx, 45, 55, 1.4);
  }

  function updateInstructionText(text) {
    document.getElementById("gps-instruction-text").textContent = text;
  }

  // Initialize UI active speed highlight
  updateSpeedUI(5);
});
