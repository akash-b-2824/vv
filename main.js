// Basic 3D Car Racing using Three.js
// Keyboard: Arrow keys or WASD. R to reset.

(() => {
	const canvas = document.getElementById('scene');
	const hudSpeed = document.getElementById('speed');
	const hudLap = document.getElementById('lap');
	const hudTimer = document.getElementById('timer');
	const hudMessage = document.getElementById('message');

	// Renderer
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	resize();

	// Scene and Camera
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x0b0e13);

	const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
	scene.add(camera);

	// Lights
	const hemi = new THREE.HemisphereLight(0xffffff, 0x223355, 0.6);
	scene.add(hemi);
	const dir = new THREE.DirectionalLight(0xffffff, 0.9);
	dir.position.set(50, 100, 0);
	dir.castShadow = false;
	scene.add(dir);

	// Ground
	const ground = new THREE.Mesh(
		new THREE.PlaneGeometry(4000, 4000),
		new THREE.MeshPhongMaterial({ color: 0x0a0d12, depthWrite: true })
	);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = false;
	scene.add(ground);

	// Track: closed Catmull-Rom curve extruded as tube
	const trackPoints = [];
	const radius = 160; // track centerline radius
	for (let i = 0; i < 12; i++) {
		const angle = (i / 12) * Math.PI * 2;
		const r = radius + (i % 2 === 0 ? 40 : -30);
		trackPoints.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
	}
	const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'catmullrom', 0.2);
	const trackTube = new THREE.Mesh(
		new THREE.TubeGeometry(trackCurve, 800, 8, 16, true),
		new THREE.MeshStandardMaterial({ color: 0x2b3a55, metalness: 0.0, roughness: 0.9 })
	);
	trackTube.receiveShadow = false;
	scene.add(trackTube);

	// Start/Finish gate
	const startPoint = trackCurve.getPointAt(0);
	const startTangent = trackCurve.getTangentAt(0);
	const startNormal = new THREE.Vector3(-startTangent.z, 0, startTangent.x);
	const gateWidth = 20;
	const gateHeight = 8;
	const gate = new THREE.Mesh(
		new THREE.BoxGeometry(gateWidth, gateHeight, 1),
		new THREE.MeshStandardMaterial({ color: 0xffaf00, emissive: 0x221100, emissiveIntensity: 0.4 })
	);
	gate.position.copy(startPoint.clone().add(startNormal.clone().multiplyScalar(8)));
	gate.position.y = gateHeight * 0.5;
	gate.lookAt(gate.position.clone().add(startNormal));
	scene.add(gate);

	// Obstacles
	const obstacles = new THREE.Group();
	const obstacleBoxes = [];
	for (let i = 1; i <= 10; i++) {
		const t = i / 10;
		const p = trackCurve.getPointAt(t);
		const n = trackCurve.getTangentAt(t);
		const side = i % 2 === 0 ? 1 : -1;
		const outward = new THREE.Vector3(-n.z, 0, n.x).multiplyScalar(side * 14 + (Math.random() * 6 - 3));
		const pos = p.clone().add(outward);
		const box = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshStandardMaterial({ color: 0x9a2f2f }));
		box.position.copy(pos);
		box.position.y = 3;
		obstacles.add(box);
		obstacleBoxes.push(box);
	}
	scene.add(obstacles);

	// Car model (simple)
	const car = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.BoxGeometry(8, 2, 14),
		new THREE.MeshStandardMaterial({ color: 0x2fd6ff, metalness: 0.1, roughness: 0.6 })
	);
	body.position.y = 2;
	car.add(body);
	// Wheels
	const wheelGeo = new THREE.CylinderGeometry(2, 2, 2, 16);
	wheelGeo.rotateZ(Math.PI / 2);
	const wheelMat = new THREE.MeshStandardMaterial({ color: 0x202022, roughness: 1 });
	const wheelOffsets = [
		[-3, 0.8, 5], [3, 0.8, 5],
		[-3, 0.8, -5], [3, 0.8, -5]
	];
	for (const [x, y, z] of wheelOffsets) {
		const w = new THREE.Mesh(wheelGeo, wheelMat);
		w.position.set(x, y, z);
		car.add(w);
	}
	car.position.copy(trackCurve.getPointAt(0).clone().add(new THREE.Vector3(0, 2, 0)));
	car.rotation.y = Math.atan2(startTangent.x, startTangent.z);
	scene.add(car);

	// Physics state
	let speed = 0; // units per second
	let steerInput = 0;
	let accelInput = 0;
	const maxSpeed = 120;
	const acceleration = 60; // per second^2
	const braking = 120;
	const friction = 12; // passive slowdown per second
	const steerStrength = 1.6; // radians per second at speed factor 1

	// Lap/Timer
	let laps = 0;
	const totalLaps = 3;
	let raceStarted = false;
	let raceFinished = false;
	let startTimeMs = 0;
	let elapsedMs = 0;
	let lastGateSide = null;

	function msToClock(ms) {
		const m = Math.floor(ms / 60000);
		const s = Math.floor((ms % 60000) / 1000);
		const mm = Math.floor(ms % 1000);
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mm).padStart(3, '0')}`;
	}

	function updateHUD() {
		hudSpeed.textContent = `${Math.max(0, speed * 2 | 0)} km/h`;
		hudLap.textContent = `Lap ${Math.min(laps, totalLaps)} / ${totalLaps}`;
		hudTimer.textContent = msToClock(elapsedMs);
	}

	function setMessage(text, durationMs = 1500) {
		hudMessage.textContent = text;
		if (durationMs > 0) {
			setTimeout(() => { if (hudMessage.textContent === text) hudMessage.textContent = ''; }, durationMs);
		}
	}

	setMessage('Press W / ↑ to accelerate. R to reset.');

	// Input handling
	const keys = new Set();
	window.addEventListener('keydown', (e) => {
		keys.add(e.key.toLowerCase());
		if (e.key === ' ') e.preventDefault();
	});
	window.addEventListener('keyup', (e) => {
		keys.delete(e.key.toLowerCase());
	});

	// Touch controls
	const btnLeft = document.getElementById('btn-left');
	const btnRight = document.getElementById('btn-right');
	const btnAccel = document.getElementById('btn-accel');
	const btnBrake = document.getElementById('btn-brake');

	function bindHold(button, on, off) {
		const start = (e) => { e.preventDefault(); on(); };
		const end = (e) => { e.preventDefault(); off(); };
		button.addEventListener('touchstart', start, { passive: false });
		button.addEventListener('touchend', end, { passive: false });
		button.addEventListener('touchcancel', end, { passive: false });
		button.addEventListener('mousedown', start);
		window.addEventListener('mouseup', end);
	}

	let touchLeft = false;
	let touchRight = false;
	let touchAccel = false;
	let touchBrake = false;

	bindHold(btnLeft, () => touchLeft = true, () => touchLeft = false);
	bindHold(btnRight, () => touchRight = true, () => touchRight = false);
	bindHold(btnAccel, () => touchAccel = true, () => touchAccel = false);
	bindHold(btnBrake, () => touchBrake = true, () => touchBrake = false);

	// Resize handler
	window.addEventListener('resize', resize);
	function resize() {
		const w = window.innerWidth;
		const h = window.innerHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	// Helper: find nearest point on track to a position (coarse sample)
	function nearestPointOnTrack(position) {
		let bestT = 0;
		let bestD2 = Infinity;
		const samples = 400;
		for (let i = 0; i <= samples; i++) {
			const t = i / samples;
			const p = trackCurve.getPointAt(t);
			const d2 = p.distanceToSquared(position);
			if (d2 < bestD2) { bestD2 = d2; bestT = t; }
		}
		return { t: bestT, d2: bestD2, point: trackCurve.getPointAt(bestT), tangent: trackCurve.getTangentAt(bestT) };
	}

	// Reset
	function resetCar() {
		const p = trackCurve.getPointAt(0);
		const t = trackCurve.getTangentAt(0);
		car.position.copy(p).add(new THREE.Vector3(0, 2, 0));
		car.rotation.set(0, Math.atan2(t.x, t.z), 0);
		speed = 0;
		laps = 0;
		raceFinished = false;
		raceStarted = false;
		elapsedMs = 0;
		startTimeMs = performance.now();
		lastGateSide = null;
		setMessage('Go!');
	}

	resetCar();

	// Main loop
	let last = performance.now();
	function frame(now) {
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;

		// Inputs
		const left = keys.has('arrowleft') || keys.has('a') || touchLeft;
		const right = keys.has('arrowright') || keys.has('d') || touchRight;
		const up = keys.has('arrowup') || keys.has('w') || touchAccel;
		const down = keys.has('arrowdown') || keys.has('s') || touchBrake;
		if (keys.has('r')) resetCar();

		steerInput = (left ? 1 : 0) * 1 + (right ? -1 : 0) * 1; // left positive
		accelInput = (up ? 1 : 0) + (down ? -1 : 0);

		// Physics integration
		if (accelInput > 0) {
			speed += acceleration * accelInput * dt;
			raceStarted = true;
		} else if (accelInput < 0) {
			speed += braking * accelInput * dt; // braking reduces speed
		}
		// Friction
		if (accelInput === 0) {
			if (speed > 0) speed = Math.max(0, speed - friction * dt);
			else speed = Math.min(0, speed + friction * dt);
		}
		speed = Math.max(-40, Math.min(maxSpeed, speed));

		// Steering based on speed
		const speedFactor = Math.min(1, Math.abs(speed) / maxSpeed);
		const yawRate = steerStrength * speedFactor * steerInput;
		car.rotation.y += yawRate * dt * Math.sign(speed || 1);

		// Move in facing direction
		const forward = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
		car.position.add(forward.multiplyScalar(speed * dt));

		// Track keeping: soft constraint towards tube center
		const nearest = nearestPointOnTrack(car.position);
		const maxOffset = 10; // allowed half-width
		const offsetVec = car.position.clone().sub(nearest.point);
		const lateralDist = offsetVec.length();
		if (lateralDist > maxOffset) {
			// Push back inside and reduce speed
			const push = offsetVec.setLength(lateralDist - maxOffset);
			car.position.sub(push.multiplyScalar(0.6));
			speed *= 0.85;
		}

		// Obstacle collisions (simple AABB)
		const carBox = new THREE.Box3().setFromObject(car);
		for (const box of obstacleBoxes) {
			const b = new THREE.Box3().setFromObject(box);
			if (carBox.intersectsBox(b)) {
				// simple response: bounce back and slow down
				car.position.add(forward.clone().multiplyScalar(-6));
				speed *= 0.5;
			}
		}

		// Lap detection via crossing the normal of start gate
		const rel = car.position.clone().sub(startPoint);
		const sideNow = Math.sign(rel.dot(startNormal));
		if (lastGateSide === null) lastGateSide = sideNow;
		if (sideNow !== 0 && lastGateSide !== 0 && sideNow !== lastGateSide) {
			if (raceStarted && !raceFinished) {
				laps += 1;
				if (laps >= 1 && laps <= totalLaps) setMessage(`Lap ${laps}/${totalLaps}`);
				if (laps >= totalLaps) {
					raceFinished = true;
					setMessage(`Finished! Time ${msToClock(elapsedMs)}`, 4000);
				}
			}
		}
		lastGateSide = sideNow;

		// Camera follow (third-person)
		const camOffset = new THREE.Vector3(0, 18, -26);
		const camRot = new THREE.Euler(0, car.rotation.y, 0);
		const camPos = new THREE.Vector3(0, 0, 0).copy(camOffset).applyEuler(camRot).add(car.position);
		camera.position.lerp(camPos, 1 - Math.exp(-dt * 6));
		camera.lookAt(car.position.clone().add(new THREE.Vector3(0, 3, 0)));

		// Timer
		if (raceStarted && !raceFinished) {
			elapsedMs = now - startTimeMs;
		} else if (!raceStarted) {
			startTimeMs = now;
			elapsedMs = 0;
		}

		updateHUD();
		renderer.render(scene, camera);
		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
})();


