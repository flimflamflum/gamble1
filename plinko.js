document.addEventListener('DOMContentLoaded', () => {
    // Constants
    const CANVAS_WIDTH = 700;
    const CANVAS_HEIGHT = 550;
    const PIN_RADIUS = 3;
    const BALL_RADIUS = 6;
    const PIN_COLOR = '#ffffff';
    const BALL_COLOR = '#00ff00';
    
    // Multiplier configurations for different risk levels
    const MULTIPLIERS = {
        low: [1.8, 1.5, 1.2, 0.8, 0.5, 0.8, 1.2, 1.5, 1.8],
        medium: [110, 41, 22, 5, 1.8, 1.2, 0.4, 0.3, 0.4, 1.2, 1.8, 5, 22, 41, 110],
        high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
    };

    // Audio context for sounds
    let audioCtx;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('Web Audio API not supported in this browser');
    }

    // Game state
    let state = {
        engine: null,
        render: null,
        runner: null,
        activeBalls: [],
        pins: [],
        walls: [],
        betAmount: 100,
        risk: 'medium',
        rows: 16,
        maxActiveBalls: 5,
        lastCollisionTime: 0,
        collisionDebounceTime: 50 // ms
    };

    // Initialize Matter.js
    function initPhysics() {
        // Create engine
        state.engine = Matter.Engine.create({
            enableSleeping: false,
            constraintIterations: 4
        });

        // Create renderer
        const canvas = document.getElementById('plinkoCanvas');
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        
        state.render = Matter.Render.create({
            canvas: canvas,
            engine: state.engine,
            options: {
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                wireframes: false,
                background: 'transparent'
            }
        });

        // Create runner
        state.runner = Matter.Runner.create();

        // Setup physics world
        setupWorld();

        // Set up collision detection
        Matter.Events.on(state.engine, 'collisionStart', handleCollision);

        // Start the renderer
        Matter.Render.run(state.render);
        Matter.Runner.run(state.runner, state.engine);
    }

    function handleCollision(event) {
        const now = Date.now();
        
        // Debounce collisions to prevent too many sounds at once
        if (now - state.lastCollisionTime < state.collisionDebounceTime) {
            return;
        }
        
        const pairs = event.pairs;
        
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            
            // Check if a ball hit a pin
            const bodyA = pair.bodyA;
            const bodyB = pair.bodyB;
            
            // If one body is a ball and the other is a pin
            const isBallAndPin = 
                (state.activeBalls.some(ball => ball.id === bodyA.id) && state.pins.some(pin => pin.id === bodyB.id)) ||
                (state.activeBalls.some(ball => ball.id === bodyB.id) && state.pins.some(pin => pin.id === bodyA.id));
            
            if (isBallAndPin) {
                playPinSound();
                state.lastCollisionTime = now;
                break; // Only play one sound per collision batch
            }
        }
    }

    function playPinSound() {
        if (!audioCtx) return;
        
        try {
            // Create oscillator
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            // Configure sound
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800 + Math.random() * 500, audioCtx.currentTime);
            
            // Configure volume envelope
            gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            
            // Connect nodes
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            // Play sound
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        } catch (e) {
            console.error('Error playing pin sound:', e);
        }
    }

    function setupWorld() {
        // Clear existing objects
        Matter.World.clear(state.engine.world);
        state.pins = [];
        state.walls = [];

        // Create walls with increased bounciness to push balls back to center
        const wallOptions = {
            isStatic: true,
            restitution: 0.8,  // Make walls more bouncy
            render: { fillStyle: '#1e3643' }
        };

        // Add walls
        const leftWall = Matter.Bodies.rectangle(0, CANVAS_HEIGHT/2, 20, CANVAS_HEIGHT, wallOptions);
        const rightWall = Matter.Bodies.rectangle(CANVAS_WIDTH, CANVAS_HEIGHT/2, 20, CANVAS_HEIGHT, wallOptions);
        state.walls = [leftWall, rightWall];

        // Create pins
        const pinOptions = {
            isStatic: true,
            render: {
                fillStyle: PIN_COLOR
            },
            collisionFilter: {
                group: 0,
                category: 0x0002,
                mask: 0x0001
            }
        };

        // Calculate pin positions based on rows
        const startY = 60;
        const pinSpacing = 42;
        const rowSpacing = 32;
        
        for (let row = 0; row < state.rows; row++) {
            const pinsInRow = row + 3;
            const rowWidth = (pinsInRow - 1) * pinSpacing;
            const startX = (CANVAS_WIDTH - rowWidth) / 2;
            
            for (let pin = 0; pin < pinsInRow; pin++) {
                const x = startX + (pin * pinSpacing);
                const y = startY + (row * rowSpacing);
                
                // Calculate normalized position (0 = leftmost, 1 = rightmost in row)
                const normalizedPos = pin / (pinsInRow - 1);
                
                // Create a bias that makes outer pins push balls inward - adjusted per risk level
                let offsetX, restitution, friction;
                
                // Apply different pin physics based on risk level
                if (state.risk === 'low') {
                    // Low risk - bias toward center (0.5x)
                    if (normalizedPos < 0.2) {
                        // Left side outer pins (strong push right)
                        offsetX = Math.random() * 0.8 + 0.4;  // +0.4 to +1.2
                        restitution = 0.7;  // Moderately bouncy
                        friction = 0.08;    // Moderate friction
                    } else if (normalizedPos > 0.8) {
                        // Right side outer pins (strong push left)
                        offsetX = Math.random() * -0.8 - 0.4;  // -0.4 to -1.2
                        restitution = 0.7;  // Moderately bouncy
                        friction = 0.08;    // Moderate friction
                    } else if (normalizedPos < 0.35) {
                        // Left side inner pins (moderate push right)
                        offsetX = Math.random() * 0.6 + 0.2;  // +0.2 to +0.8
                        restitution = 0.6;  // Less bouncy
                        friction = 0.1;    // More friction
                    } else if (normalizedPos > 0.65) {
                        // Right side inner pins (moderate push left)
                        offsetX = Math.random() * -0.6 - 0.2;  // -0.2 to -0.8
                        restitution = 0.6;  // Less bouncy
                        friction = 0.1;    // More friction
                    } else if (normalizedPos > 0.4 && normalizedPos < 0.6) {
                        // Center pins (center hold)
                        offsetX = Math.random() * 0.3 - 0.15;  // -0.15 to +0.15
                        restitution = 0.4;  // Less bouncy
                        friction = 0.15;    // Higher friction
                    } else {
                        // Transition pins
                        offsetX = Math.random() * 0.4 - 0.2;  // -0.2 to +0.2
                        restitution = 0.5;  // Medium bounce
                        friction = 0.12;    // Medium friction
                    }
                } else if (state.risk === 'medium') {
                    // Medium risk - strong bias toward 0.3-0.4x
                    if (normalizedPos < 0.15) {
                        // Far left side pins (strong push right)
                        offsetX = Math.random() * 1.8 + 0.9;  // +0.9 to +2.7
                        restitution = 0.95;  // Very bouncy
                        friction = 0.02;    // Very low friction
                    } else if (normalizedPos > 0.85) {
                        // Far right side pins (strong push left)
                        offsetX = Math.random() * -1.8 - 0.9;  // -0.9 to -2.7
                        restitution = 0.95;  // Very bouncy
                        friction = 0.02;    // Very low friction
                    } else if (normalizedPos < 0.3) {
                        // Left side outer pins (moderate push right)
                        offsetX = Math.random() * 1.4 + 0.7;  // +0.7 to +2.1
                        restitution = 0.85;  // Very bouncy
                        friction = 0.03;    // Low friction
                    } else if (normalizedPos > 0.7) {
                        // Right side outer pins (moderate push left)
                        offsetX = Math.random() * -1.4 - 0.7;  // -0.7 to -2.1
                        restitution = 0.85;  // Very bouncy
                        friction = 0.03;    // Low friction
                    } else if (normalizedPos < 0.42) {
                        // Left side inner pins (mild push right)
                        offsetX = Math.random() * 1.0 + 0.3;  // +0.3 to +1.3
                        restitution = 0.7;  // Moderately bouncy
                        friction = 0.05;    // Moderate friction
                    } else if (normalizedPos > 0.58) {
                        // Right side inner pins (mild push left)
                        offsetX = Math.random() * -1.0 - 0.3;  // -0.3 to -1.3
                        restitution = 0.7;  // Moderately bouncy
                        friction = 0.05;    // Moderate friction
                    } else {
                        // Center pins (center hold for 0.3-0.4x range)
                        offsetX = Math.random() * 0.1 - 0.05;  // -0.05 to +0.05
                        restitution = 0.25;  // Very low bounce
                        friction = 0.3;     // High friction to trap balls
                    }
                } else {
                    // High risk - extreme bias toward 0.2x in center
                    if (normalizedPos < 0.1) {
                        // Far left side pins (extreme push right)
                        offsetX = Math.random() * 2.2 + 1.8;  // +1.8 to +4.0
                        restitution = 1;     // Maximum bounce
                        friction = 0.005;    // Extremely slippery
                    } else if (normalizedPos > 0.9) {
                        // Far right side pins (extreme push left)
                        offsetX = Math.random() * -2.2 - 1.8;  // -1.8 to -4.0
                        restitution = 1;     // Maximum bounce
                        friction = 0.005;    // Extremely slippery
                    } else if (normalizedPos < 0.25) {
                        // Left side outer pins (strong push right)
                        offsetX = Math.random() * 1.7 + 1.2;  // +1.2 to +2.9
                        restitution = 0.95;  // Very bouncy
                        friction = 0.01;     // Very slippery
                    } else if (normalizedPos > 0.75) {
                        // Right side outer pins (strong push left)
                        offsetX = Math.random() * -1.7 - 1.2;  // -1.2 to -2.9
                        restitution = 0.95;  // Very bouncy
                        friction = 0.01;     // Very slippery
                    } else if (normalizedPos < 0.4) {
                        // Left side inner pins (moderate push right)
                        offsetX = Math.random() * 1.2 + 0.8;  // +0.8 to +2.0
                        restitution = 0.8;   // Very bouncy
                        friction = 0.02;     // Very low friction
                    } else if (normalizedPos > 0.6) {
                        // Right side inner pins (moderate push left)
                        offsetX = Math.random() * -1.2 - 0.8;  // -0.8 to -2.0
                        restitution = 0.8;   // Very bouncy
                        friction = 0.02;     // Very low friction
                    } else {
                        // Center pins (extreme center hold)
                        offsetX = Math.random() * 0.06 - 0.03;  // -0.03 to +0.03
                        restitution = 0.05;  // Almost no bounce
                        friction = 0.5;      // Extremely high friction
                    }
                }
                
                const pinBody = Matter.Bodies.circle(
                    x + offsetX, 
                    y, 
                    PIN_RADIUS, 
                    pinOptions
                );
                
                // Apply custom physics properties
                pinBody.restitution = restitution;
                pinBody.friction = friction;
                
                state.pins.push(pinBody);
            }
        }

        // Create influencers with different strengths based on risk level
        const influencerOptions = {
            isStatic: true,
            isSensor: true,
            render: {
                visible: false
            },
            collisionFilter: {
                group: 0,
                category: 0x0004,
                mask: 0x0001
            }
        };
        
        // Create a system of influencers based on risk level
        const influencers = [];
        const centerX = CANVAS_WIDTH / 2;
        
        if (state.risk === 'low') {
            // Low risk - guide balls toward center (0.5x)
            // Center column influencer (strongest)
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 200, 80, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 1e-6,
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Edge barriers to redirect far-out balls
            influencers.push(
                Matter.Bodies.circle(centerX - 280, CANVAS_HEIGHT - 250, 90, influencerOptions),
                Matter.Bodies.circle(centerX + 280, CANVAS_HEIGHT - 250, 90, influencerOptions)
            );
            
            // Guides toward 1.2-1.8x slots
            influencers.push(
                Matter.Bodies.circle(centerX - 140, CANVAS_HEIGHT - 300, 40, influencerOptions),
                Matter.Bodies.circle(centerX + 140, CANVAS_HEIGHT - 300, 40, influencerOptions)
            );
        } else if (state.risk === 'medium') {
            // Medium risk - strong bias toward 0.3-0.4x slots
            // Central attractors
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 180, 120, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 2.5e-6,
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Higher up central guide
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 350, 100, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 1.5e-6,
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Strong outer barriers
            influencers.push(
                Matter.Bodies.circle(centerX - 280, CANVAS_HEIGHT - 250, 150, influencerOptions),
                Matter.Bodies.circle(centerX + 280, CANVAS_HEIGHT - 250, 150, influencerOptions)
            );
            
            // Secondary barriers
            influencers.push(
                Matter.Bodies.circle(centerX - 200, CANVAS_HEIGHT - 350, 120, influencerOptions),
                Matter.Bodies.circle(centerX + 200, CANVAS_HEIGHT - 350, 120, influencerOptions)
            );
            
            // Lower guides
            influencers.push(
                Matter.Bodies.circle(centerX - 120, CANVAS_HEIGHT - 150, 100, influencerOptions),
                Matter.Bodies.circle(centerX + 120, CANVAS_HEIGHT - 150, 100, influencerOptions)
            );
        } else {
            // High risk - extreme bias toward 0.2x in center
            // Super strong center attractor
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 250, 160, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 6e-6,
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Secondary center attractor lower down
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 120, 140, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 8e-6,
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Layered barriers to keep balls in
            // Outer barriers
            influencers.push(
                Matter.Bodies.circle(centerX - 300, CANVAS_HEIGHT - 250, 200, influencerOptions),
                Matter.Bodies.circle(centerX + 300, CANVAS_HEIGHT - 250, 200, influencerOptions)
            );
            
            // Middle barriers
            influencers.push(
                Matter.Bodies.circle(centerX - 240, CANVAS_HEIGHT - 350, 170, influencerOptions),
                Matter.Bodies.circle(centerX + 240, CANVAS_HEIGHT - 350, 170, influencerOptions)
            );
            
            // Inner barriers
            influencers.push(
                Matter.Bodies.circle(centerX - 180, CANVAS_HEIGHT - 200, 150, influencerOptions),
                Matter.Bodies.circle(centerX + 180, CANVAS_HEIGHT - 200, 150, influencerOptions)
            );
        }
        
        // Add the influencers to walls array
        state.walls = [...state.walls, ...influencers];

        // Add multiplier dividers at the bottom
        const multipliers = MULTIPLIERS[state.risk];
        const dividerSpacing = CANVAS_WIDTH / multipliers.length;
        const dividerY = CANVAS_HEIGHT - 60;
        const dividerHeight = 60;
        
        for (let i = 1; i < multipliers.length; i++) {
            const divider = Matter.Bodies.rectangle(
                i * dividerSpacing,
                dividerY + dividerHeight/2,
                2,
                dividerHeight,
                wallOptions
            );
            state.walls.push(divider);
        }

        // Add slot modifiers based on risk level to achieve target probabilities
        if (state.risk === 'medium' || state.risk === 'high') {
            const multipliers = MULTIPLIERS[state.risk];
            const slotCount = multipliers.length;
            
            // Calculate which slots have high multipliers
            let highMultiplierIndices = [];
            
            if (state.risk === 'medium') {
                // For medium, highest multipliers are at the edges (110x)
                const threshold = 30;
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= threshold) {
                        highMultiplierIndices.push(i);
                    }
                }
            } else {
                // For high, highest multipliers are at the edges (1000x, 555x)
                const threshold = 500;
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= threshold) {
                        highMultiplierIndices.push(i);
                    }
                }
            }
            
            // Add barriers to make high multiplier slots harder to reach
            highMultiplierIndices.forEach(index => {
                const slotCenter = (index + 0.5) * dividerSpacing;
                // Reduce barrier width slightly to prevent balls getting stuck
                const narrowingPercentage = state.risk === 'high' ? 0.9 : 0.8;
                
                const barrierOptions = {
                    isStatic: true,
                    render: { visible: false },
                    collisionFilter: {
                        group: 0,
                        category: 0x0002,
                        mask: 0x0001
                    }
                };
                
                // Add a barrier in the high multiplier slot - position it higher to avoid ball sticking
                state.walls.push(
                    Matter.Bodies.rectangle(
                        slotCenter,
                        CANVAS_HEIGHT - 45, // Move up slightly
                        dividerSpacing * narrowingPercentage,
                        8, // Reduced height
                        barrierOptions
                    )
                );
            });
            
            // Medium risk: make 22x slots slightly harder to reach
            if (state.risk === 'medium') {
                const mediumHighMultiplierIndices = [];
                const threshold = 15;
                
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= threshold && multipliers[i] < 30) {
                        mediumHighMultiplierIndices.push(i);
                    }
                }
                
                mediumHighMultiplierIndices.forEach(index => {
                    const slotCenter = (index + 0.5) * dividerSpacing;
                    const narrowingPercentage = 0.65; // Reduced from 0.7
                    
                    const barrierOptions = {
                        isStatic: true,
                        render: { visible: false },
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    };
                    
                    // Add a smaller barrier in the medium-high multiplier slot
                    state.walls.push(
                        Matter.Bodies.rectangle(
                            slotCenter,
                            CANVAS_HEIGHT - 40, // Move up slightly
                            dividerSpacing * narrowingPercentage,
                            6, // Reduced height
                            barrierOptions
                        )
                    );
                });
            }
            
            // High risk: make 29x-118x slots slightly harder to reach
            if (state.risk === 'high') {
                const mediumHighMultiplierIndices = [];
                const threshold = 20;
                
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= threshold && multipliers[i] < 500) {
                        mediumHighMultiplierIndices.push(i);
                    }
                }
                
                mediumHighMultiplierIndices.forEach(index => {
                    const slotCenter = (index + 0.5) * dividerSpacing;
                    const narrowingPercentage = 0.55; // Reduced from 0.6
                    
                    const barrierOptions = {
                        isStatic: true,
                        render: { visible: false },
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    };
                    
                    // Add a smaller barrier in the medium-high multiplier slot
                    state.walls.push(
                        Matter.Bodies.rectangle(
                            slotCenter,
                            CANVAS_HEIGHT - 40, // Move up slightly
                            dividerSpacing * narrowingPercentage,
                            6, // Reduced height
                            barrierOptions
                        )
                    );
                });
            }
        }

        // Add all bodies to the world
        Matter.World.add(state.engine.world, [...state.pins, ...state.walls]);

        // Update multiplier display
        updateMultiplierDisplay();
    }

    function updateMultiplierDisplay() {
        const multipliersContainer = document.querySelector('.multipliers');
        multipliersContainer.innerHTML = '';
        
        const multipliers = MULTIPLIERS[state.risk];
        
        // Calculate container width
        const containerWidth = multipliersContainer.offsetWidth || CANVAS_WIDTH;
        
        // Create multiplier elements
        multipliers.forEach((multiplier, index) => {
            const div = document.createElement('div');
            div.className = `multiplier ${getMultiplierClass(multiplier)}`;
            div.textContent = `${multiplier}×`;
            
            // For low risk mode, ensure equal spacing by setting specific widths and positions
            if (state.risk === 'low') {
                const slotWidth = containerWidth / multipliers.length;
                div.style.width = `${slotWidth}px`;
                div.style.position = 'absolute';
                div.style.left = `${index * slotWidth}px`;
                div.style.textAlign = 'center';
            }
            
            multipliersContainer.appendChild(div);
        });
    }

    function getMultiplierClass(multiplier) {
        if (multiplier >= 10) return 'red';
        if (multiplier >= 3) return 'orange';
        return 'yellow';
    }

    function dropBall() {
        // If we're at max active balls, don't add another
        if (state.activeBalls.length >= state.maxActiveBalls) {
            return;
        }
        
        // Clean up any potentially stuck balls first (older than 15 seconds)
        const currentTime = Date.now();
        
        state.activeBalls.forEach(ball => {
            if (ball.createdAt && currentTime - ball.createdAt > 15000) {
                // This ball has been around too long, remove it
                state.activeBalls = state.activeBalls.filter(activeBall => activeBall.id !== ball.id);
                Matter.World.remove(state.engine.world, ball);
            }
        });
        
        // Create ball with physics based on risk level
        let ballRestitution, ballFriction, ballDensity;
        
        // Adjust ball physics based on risk level
        if (state.risk === 'low') {
            ballRestitution = 0.55;  // Medium bounce
            ballFriction = 0.1;      // Medium friction
            ballDensity = 0.1;       // Medium weight
        } else if (state.risk === 'medium') {
            ballRestitution = 0.35;  // Less bouncy
            ballFriction = 0.25;     // More friction
            ballDensity = 0.15;      // Heavier
        } else {
            ballRestitution = 0.2;   // Very little bounce
            ballFriction = 0.35;     // High friction
            ballDensity = 0.2;       // Very heavy
        }
        
        const ballOptions = {
            restitution: ballRestitution,
            friction: ballFriction,
            density: ballDensity,
            frictionAir: 0.01,       // Add some air friction to prevent excessive motion
            render: {
                fillStyle: BALL_COLOR
            },
            collisionFilter: {
                group: 0,
                category: 0x0001,
                mask: 0x0002
            }
        };

        // Calculate starting position based on risk level
        let startX;
        const rand = Math.random();
        
        // Different starting distributions based on risk
        if (state.risk === 'low') {
            // Low risk - bias toward center but with some variability
            if (rand < 0.65) {
                // 65% in center region for 0.5x outcome
                startX = CANVAS_WIDTH/2 + (Math.random() * 30 - 15);
            } else if (rand < 0.9) {
                // 25% in near-center for 0.8 and 1.2 outcomes
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (20 + Math.random() * 30));
            } else {
                // 10% wider spread for edge multipliers
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (60 + Math.random() * 40));
            }
        } else if (state.risk === 'medium') {
            // Medium risk - strong bias toward center (0.3-0.4x)
            if (rand < 0.75) {
                // 75% in center region for 0.3-0.4x outcomes
                startX = CANVAS_WIDTH/2 + (Math.random() * 20 - 10);
            } else if (rand < 0.95) {
                // 20% in slight offset for 1.2-1.8x
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (15 + Math.random() * 25));
            } else {
                // 5% chance for wider positions (potentially higher multipliers)
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (50 + Math.random() * 40));
            }
        } else {
            // High risk - extreme bias toward center (0.2x)
            if (rand < 0.85) {
                // 85% very near center for 0.2x outcome
                startX = CANVAS_WIDTH/2 + (Math.random() * 8 - 4);
            } else if (rand < 0.98) {
                // 13% slightly offset for medium multipliers
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (10 + Math.random() * 20));
            } else {
                // 2% rare chance for wide positions (potentially high multipliers)
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (40 + Math.random() * 30));
            }
        }
        
        const ball = Matter.Bodies.circle(startX, 0, BALL_RADIUS, ballOptions);
        
        // Add timestamp to detect old balls
        ball.createdAt = Date.now();
        
        // Apply different central force based on risk level
        let centralForceMultiplier;
        if (state.risk === 'low') {
            centralForceMultiplier = 0.0002; // Mild central force for 0.5x bias
        } else if (state.risk === 'medium') {
            centralForceMultiplier = 0.0008; // Strong central force for 0.3-0.4x bias
        } else {
            centralForceMultiplier = 0.0015; // Extreme central force for 0.2x bias
        }
        
        // Calculate and apply force
        const centralForce = (CANVAS_WIDTH/2 - startX) * centralForceMultiplier;
        Matter.Body.applyForce(ball, ball.position, { 
            x: centralForce, 
            y: 0.001  // Increase downward force slightly to ensure movement
        });
        
        // Add to state and world
        state.activeBalls.push(ball);
        Matter.World.add(state.engine.world, ball);
        
        // Re-enable bet button to allow multiple bets
        document.getElementById('bet-button').disabled = false;
    }

    function checkBallPositions() {
        // Find balls that have reached the bottom or are stuck
        const currentTime = Date.now();
        
        state.activeBalls.forEach(ball => {
            // Check if ball has no/minimal velocity for too long (stuck)
            if (!ball.stuckSince && Math.abs(ball.velocity.y) < 0.2 && ball.position.y > CANVAS_HEIGHT - 150) {
                ball.stuckSince = currentTime;
            }
            
            // If ball is moving again, reset the stuck timer
            if (ball.stuckSince && Math.abs(ball.velocity.y) > 0.5) {
                ball.stuckSince = null;
            }
        });
        
        // Find balls that have reached the bottom or have been stuck for too long
        const bottomBalls = state.activeBalls.filter(ball => 
            ball.position.y > CANVAS_HEIGHT - 30 || 
            (ball.stuckSince && currentTime - ball.stuckSince > 2000) // Ball stuck for more than 2 seconds
        );
        
        // Process each ball that reached the bottom or is stuck
        bottomBalls.forEach(ball => {
            // Calculate which multiplier slot the ball ended in
            const multipliers = MULTIPLIERS[state.risk];
            const slotWidth = CANVAS_WIDTH / multipliers.length;
            const slotIndex = Math.min(
                Math.max(0, Math.floor(ball.position.x / slotWidth)),
                multipliers.length - 1
            );
            const multiplier = multipliers[slotIndex];

            // Calculate the payout amount, ensure it's a valid number
            const rawPayoutAmount = state.betAmount * multiplier;
            const payoutAmount = Math.floor(isNaN(rawPayoutAmount) ? 0 : rawPayoutAmount);
            
            // Get current balance and add the payout
            let currentBalance = parseInt(localStorage.getItem('userBalance'));
            // Ensure the balance is a valid number
            if (isNaN(currentBalance)) {
                currentBalance = 0;
            }
            
            const newBalance = currentBalance + payoutAmount;
            localStorage.setItem('userBalance', newBalance);

            // Remove the ball from the active list and world
            state.activeBalls = state.activeBalls.filter(activeBall => activeBall.id !== ball.id);
            Matter.World.remove(state.engine.world, ball);

            // Update UI
            updateBalance();
        });
    }

    function updateBalance() {
        let balance = parseInt(localStorage.getItem('userBalance'));
        
        // Ensure the balance is a valid number
        if (isNaN(balance)) {
            balance = 0;
            localStorage.setItem('userBalance', 0);
        }
        
        document.getElementById('header-balance').textContent = balance;
        
        // Update bet input max value based on current balance
        const betInput = document.getElementById('bet-amount');
        const currentBet = parseInt(betInput.value) || 0;
        
        // If current bet is more than balance, adjust it
        if (currentBet > balance) {
            betInput.value = balance > 0 ? balance : 0;
        }
        
        // Disable bet button if balance is 0
        const betButton = document.getElementById('bet-button');
        betButton.disabled = balance <= 0;
        
        // Add visual indication if balance is 0
        if (balance <= 0) {
            betButton.textContent = 'NO FUNDS';
            betButton.classList.add('no-funds');
        } else {
            betButton.textContent = 'BET';
            betButton.classList.remove('no-funds');
        }
    }

    // Event Listeners
    document.getElementById('bet-button').addEventListener('click', () => {
        const betAmountInput = document.getElementById('bet-amount');
        let betAmount = parseInt(betAmountInput.value);
        
        // Ensure bet amount is a valid number
        if (isNaN(betAmount) || betAmount <= 0) {
            betAmountInput.value = 100;
            betAmount = 100;
        }
        
        let currentBalance = parseInt(localStorage.getItem('userBalance'));
        
        // Ensure the balance is a valid number
        if (isNaN(currentBalance)) {
            currentBalance = 0;
            localStorage.setItem('userBalance', 0);
            updateBalance();
            return; // Can't bet with 0 balance
        }
        
        if (betAmount > 0 && betAmount <= currentBalance) {
            // Deduct bet amount immediately
            const newBalance = currentBalance - betAmount;
            localStorage.setItem('userBalance', newBalance);
            updateBalance();
            
            state.betAmount = betAmount;
            dropBall();
        } else if (currentBalance <= 0) {
            alert('No funds available! Please reset your balance.');
        } else {
            alert('Invalid bet amount! Maximum bet: ' + currentBalance);
            betAmountInput.value = currentBalance;
        }
    });

    document.getElementById('risk-level').addEventListener('change', (e) => {
        state.risk = e.target.value;
        setupWorld();
    });

    document.getElementById('rows').addEventListener('change', (e) => {
        state.rows = parseInt(e.target.value);
        setupWorld();
    });

    document.getElementById('half-bet').addEventListener('click', () => {
        const input = document.getElementById('bet-amount');
        let currentBet = parseInt(input.value);
        
        // Ensure current bet is a valid number
        if (isNaN(currentBet) || currentBet < 0) {
            currentBet = 0;
        }
        
        input.value = Math.max(1, Math.floor(currentBet / 2));
    });

    document.getElementById('double-bet').addEventListener('click', () => {
        const input = document.getElementById('bet-amount');
        let currentBet = parseInt(input.value);
        
        // Ensure current bet is a valid number
        if (isNaN(currentBet) || currentBet < 0) {
            currentBet = 0;
        }
        
        const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
        const newBet = Math.min(currentBet * 2, currentBalance);
        input.value = Math.floor(newBet);
    });

    document.getElementById('max-bet').addEventListener('click', () => {
        const input = document.getElementById('bet-amount');
        const currentBalance = parseInt(localStorage.getItem('userBalance')) || 0;
        input.value = Math.max(0, Math.floor(currentBalance));
    });

    // Initialize the game
    function init() {
        // Ensure there's a valid userBalance in localStorage
        let balance = parseInt(localStorage.getItem('userBalance'));
        if (isNaN(balance)) {
            localStorage.setItem('userBalance', 10000);
        }
        
        initPhysics();
        updateBalance(); // Update balance display on load
        
        // Set up an interval to check ball positions
        setInterval(checkBallPositions, 100);
    }

    // Initialize the game
    init();
}); 