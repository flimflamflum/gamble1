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
        medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
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
        maxActiveBalls: 5,
        lastCollisionTime: 0,
        collisionDebounceTime: 50 // ms
    };

    // Add a constant for rows instead
    const ROWS = 16;

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

        // Custom beforeUpdate to apply our graduated center pull
        Matter.Events.on(state.runner, 'beforeUpdate', function() {
            applyGraduatedCenterPull();
        });

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
        
        for (let row = 0; row < ROWS; row++) {
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
                    // Medium risk - extreme bias toward center slots (0.3x, 0.5x, 0.5x)
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
                    // High risk - extreme bias toward 0.2x in center with edge protection
                    // Ultra strong center attractor
                    offsetX = Math.random() * 0.06 - 0.03;  // -0.03 to +0.03
                    restitution = 0.05;  // Almost no bounce
                    friction = 0.5;      // Extremely high friction
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
            // Medium risk - strong bias toward center slots
            // Central attractors with increased strength
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 180, 140, { // Increased radius from 120 to 140
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 5e-6, // Increased from 3e-6
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Secondary lower center attractor (new)
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 80, 100, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 7e-6, // Very strong pull at the bottom
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Higher up central guide with increased strength
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 350, 120, { // Increased radius from 100 to 120
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 4e-6, // Increased from 2e-6
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Add medium slot modifiers to narrow all slots except the middle three
            // This will be applied later in the function where slot barriers are created
            
            // Super strong outer barriers to block the path to 110x multipliers
            influencers.push(
                Matter.Bodies.circle(centerX - 300, CANVAS_HEIGHT - 300, 250, influencerOptions),
                Matter.Bodies.circle(centerX + 300, CANVAS_HEIGHT - 300, 250, influencerOptions)
            );
            
            // Add layered barriers near the outer slots
            for (let i = 0; i < 4; i++) {
                const yOffset = 150 + (i * 80);
                const xOffset = 250 - (i * 20);
                influencers.push(
                    Matter.Bodies.circle(centerX - xOffset, CANVAS_HEIGHT - yOffset, 70 + (i * 10), influencerOptions),
                    Matter.Bodies.circle(centerX + xOffset, CANVAS_HEIGHT - yOffset, 70 + (i * 10), influencerOptions)
                );
            }
            
            // Add "catch zones" at the edges to intercept any balls that get too close to the edge
            const catchOptions = {
                isStatic: true,
                render: { visible: false },
                restitution: 0.8,
                friction: 0.05,
                collisionFilter: {
                    group: 0,
                    category: 0x0002,
                    mask: 0x0001
                }
            };
            
            // Place catch zones at multiple heights
            for (let h = 0; h < 5; h++) {
                const yPos = CANVAS_HEIGHT * (0.3 + h * 0.12);
                const xOffset = 20 + h * 8; // Wider toward the bottom
                
                influencers.push(
                    // Left catch zone with inward angle
                    Matter.Bodies.rectangle(xOffset, yPos, 5, 100, {
                        ...catchOptions,
                        angle: -Math.PI * 0.15
                    }),
                    // Right catch zone with inward angle
                    Matter.Bodies.rectangle(CANVAS_WIDTH - xOffset, yPos, 5, 100, {
                        ...catchOptions,
                        angle: Math.PI * 0.15
                    })
                );
            }
            
            // Create diagonal barriers along the outer edge of the pin field
            const rows = ROWS;
            
            for (let row = 0; row < rows-2; row++) {
                // Calculate the x position of the leftmost and rightmost pins in this row
                const pinsInRow = row + 3;
                const rowWidth = (pinsInRow - 1) * pinSpacing;
                const leftX = (CANVAS_WIDTH - rowWidth) / 2 - 5; // 5px buffer
                const rightX = CANVAS_WIDTH - leftX + 5;
                const y = startY + (row * rowSpacing);
                
                // Create angled barriers that follow the pin field boundary
                // Left side diagonal wall
                const leftBarrier = Matter.Bodies.rectangle(
                    leftX - 5,
                    y + rowSpacing/2,
                    2,
                    rowSpacing + 5,
                    {
                        isStatic: true,
                        angle: Math.PI * 0.1, // Slight angle to deflect inward
                        render: { visible: false },
                        restitution: 0.8, // Bouncy to push balls back in
                        friction: 0.05,   // Slippery
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    }
                );
                
                // Right side diagonal wall
                const rightBarrier = Matter.Bodies.rectangle(
                    rightX + 5,
                    y + rowSpacing/2,
                    2,
                    rowSpacing + 5,
                    {
                        isStatic: true,
                        angle: -Math.PI * 0.1, // Slight angle to deflect inward
                        render: { visible: false },
                        restitution: 0.8, // Bouncy to push balls back in
                        friction: 0.05,   // Slippery
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    }
                );
                
                influencers.push(leftBarrier, rightBarrier);
            }
            
            // Add specific repulsion zones for the circled problem areas
            // Left circled area - add strong repulsion to push balls back to center
            influencers.push(
                Matter.Bodies.circle(centerX - 200, CANVAS_HEIGHT - 260, 120, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only repel if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    // Calculate distance
                                    const dx = bodyB.position.x - bodyA.position.x;
                                    const dy = bodyB.position.y - bodyA.position.y;
                                    const distance = Math.sqrt(dx * dx + dy * dy);
                                    
                                    // Only apply force if within influence radius
                                    if (distance < 140) {
                                        return {
                                            x: dx * 6e-6, // Repulsive force pushing away from this area toward center
                                            y: 0
                                        };
                                    }
                                }
                            }
                        ]
                    }
                })
            );
            
            // Right circled area - add strong repulsion to push balls back to center
            influencers.push(
                Matter.Bodies.circle(centerX + 200, CANVAS_HEIGHT - 260, 120, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only repel if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    // Calculate distance
                                    const dx = bodyB.position.x - bodyA.position.x;
                                    const dy = bodyB.position.y - bodyA.position.y;
                                    const distance = Math.sqrt(dx * dx + dy * dy);
                                    
                                    // Only apply force if within influence radius
                                    if (distance < 140) {
                                        return {
                                            x: dx * 6e-6, // Repulsive force pushing away from this area toward center
                                            y: 0
                                        };
                                    }
                                }
                            }
                        ]
                    }
                })
            );
            
            // Add physical barriers in these areas to ensure balls don't get through
            for (let i = 0; i < 3; i++) {
                // Left side barriers in problem area
                influencers.push(
                    Matter.Bodies.rectangle(
                        centerX - 200 + (i * 20) - 30,
                        CANVAS_HEIGHT - 260 + (i * 20),
                        10,
                        100,
                        {
                            isStatic: true,
                            angle: Math.PI * 0.3, // Angle to deflect toward center
                            render: { visible: false },
                            restitution: 0.9,
                            friction: 0.02,
                            collisionFilter: {
                                group: 0,
                                category: 0x0002,
                                mask: 0x0001
                            }
                        }
                    )
                );
                
                // Right side barriers in problem area
                influencers.push(
                    Matter.Bodies.rectangle(
                        centerX + 200 - (i * 20) + 30,
                        CANVAS_HEIGHT - 260 + (i * 20),
                        10,
                        100,
                        {
                            isStatic: true,
                            angle: -Math.PI * 0.3, // Angle to deflect toward center
                            render: { visible: false },
                            restitution: 0.9,
                            friction: 0.02,
                            collisionFilter: {
                                group: 0,
                                category: 0x0002,
                                mask: 0x0001
                            }
                        }
                    )
                );
            }
        } else {
            // High risk - extreme bias toward 0.2x in center with edge protection
            // Ultra strong center attractor
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 250, 180, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 9e-6, // Increased from 6e-6
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Secondary center attractor lower down with stronger pull
            influencers.push(
                Matter.Bodies.circle(centerX, CANVAS_HEIGHT - 120, 160, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only attract if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    return {
                                        x: (bodyA.position.x - bodyB.position.x) * 12e-6, // Increased from 8e-6
                                        y: 0
                                    };
                                }
                            }
                        ]
                    }
                })
            );
            
            // Add even more layered barriers to keep balls away from edges
            // Outer barriers - increased size
            influencers.push(
                Matter.Bodies.circle(centerX - 300, CANVAS_HEIGHT - 250, 240, influencerOptions),
                Matter.Bodies.circle(centerX + 300, CANVAS_HEIGHT - 250, 240, influencerOptions)
            );
            
            // Secondary outer barriers (high up) - increased size
            influencers.push(
                Matter.Bodies.circle(centerX - 280, CANVAS_HEIGHT - 400, 200, influencerOptions),
                Matter.Bodies.circle(centerX + 280, CANVAS_HEIGHT - 400, 200, influencerOptions)
            );
            
            // Middle barriers - increased size
            influencers.push(
                Matter.Bodies.circle(centerX - 230, CANVAS_HEIGHT - 320, 180, influencerOptions),
                Matter.Bodies.circle(centerX + 230, CANVAS_HEIGHT - 320, 180, influencerOptions)
            );
            
            // Inner barriers - increased size and closer to center
            influencers.push(
                Matter.Bodies.circle(centerX - 160, CANVAS_HEIGHT - 200, 160, influencerOptions),
                Matter.Bodies.circle(centerX + 160, CANVAS_HEIGHT - 200, 160, influencerOptions)
            );
            
            // Add "catch zones" at the edges to intercept any balls that get close to the edge
            const catchOptions = {
                isStatic: true,
                render: { visible: false },
                restitution: 0.9, // Very bouncy to push back
                friction: 0.02,   // Very slippery
                collisionFilter: {
                    group: 0,
                    category: 0x0002,
                    mask: 0x0001
                }
            };
            
            // Place catch zones at multiple heights
            for (let h = 0; h < 6; h++) {
                const yPos = CANVAS_HEIGHT * (0.2 + h * 0.12);
                const xOffset = 15 + h * 8; // Wider toward the bottom
                
                influencers.push(
                    // Left catch zone with inward angle
                    Matter.Bodies.rectangle(xOffset, yPos, 6, 120, {
                        ...catchOptions,
                        angle: -Math.PI * 0.18
                    }),
                    // Right catch zone with inward angle
                    Matter.Bodies.rectangle(CANVAS_WIDTH - xOffset, yPos, 6, 120, {
                        ...catchOptions,
                        angle: Math.PI * 0.18
                    })
                );
            }
            
            // Create diagonal barriers along the outer edge of the pin field
            const rows = ROWS;
            
            for (let row = 0; row < rows-1; row++) {
                // Calculate the x position of the leftmost and rightmost pins in this row
                const pinsInRow = row + 3;
                const rowWidth = (pinsInRow - 1) * pinSpacing;
                const leftX = (CANVAS_WIDTH - rowWidth) / 2 - 5; // 5px buffer
                const rightX = CANVAS_WIDTH - leftX + 5;
                const y = startY + (row * rowSpacing);
                
                // Create angled barriers that follow the pin field boundary
                // Left side diagonal wall
                const leftBarrier = Matter.Bodies.rectangle(
                    leftX - 5,
                    y + rowSpacing/2,
                    2,
                    rowSpacing + 5,
                    {
                        isStatic: true,
                        angle: Math.PI * 0.12, // Slightly steeper angle to deflect inward
                        render: { visible: false },
                        restitution: 0.9, // Very bouncy to push balls back in
                        friction: 0.02,   // Very slippery
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    }
                );
                
                // Right side diagonal wall
                const rightBarrier = Matter.Bodies.rectangle(
                    rightX + 5,
                    y + rowSpacing/2,
                    2,
                    rowSpacing + 5,
                    {
                        isStatic: true,
                        angle: -Math.PI * 0.12, // Slightly steeper angle to deflect inward
                        render: { visible: false },
                        restitution: 0.9, // Very bouncy to push balls back in
                        friction: 0.02,   // Very slippery
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    }
                );
                
                influencers.push(leftBarrier, rightBarrier);
            }
            
            // Add specific repulsion zones for the circled problem areas
            // Left circled area - add strong repulsion to push balls back to center
            influencers.push(
                Matter.Bodies.circle(centerX - 200, CANVAS_HEIGHT - 260, 140, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only repel if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    // Calculate distance
                                    const dx = bodyB.position.x - bodyA.position.x;
                                    const dy = bodyB.position.y - bodyA.position.y;
                                    const distance = Math.sqrt(dx * dx + dy * dy);
                                    
                                    // Only apply force if within influence radius
                                    if (distance < 160) {
                                        return {
                                            x: dx * 8e-6, // Even stronger repulsive force for high risk
                                            y: 0
                                        };
                                    }
                                }
                            }
                        ]
                    }
                })
            );
            
            // Right circled area - add strong repulsion to push balls back to center
            influencers.push(
                Matter.Bodies.circle(centerX + 200, CANVAS_HEIGHT - 260, 140, {
                    ...influencerOptions,
                    plugin: {
                        attractors: [
                            function(bodyA, bodyB) {
                                // Only repel if it's a ball
                                if (state.activeBalls.some(ball => ball.id === bodyB.id)) {
                                    // Calculate distance
                                    const dx = bodyB.position.x - bodyA.position.x;
                                    const dy = bodyB.position.y - bodyA.position.y;
                                    const distance = Math.sqrt(dx * dx + dy * dy);
                                    
                                    // Only apply force if within influence radius
                                    if (distance < 160) {
                                        return {
                                            x: dx * 8e-6, // Even stronger repulsive force for high risk
                                            y: 0
                                        };
                                    }
                                }
                            }
                        ]
                    }
                })
            );
            
            // Add physical barriers in these areas to ensure balls don't get through
            for (let i = 0; i < 4; i++) { // Add one more layer for high risk
                // Left side barriers in problem area
                influencers.push(
                    Matter.Bodies.rectangle(
                        centerX - 200 + (i * 15) - 30,
                        CANVAS_HEIGHT - 260 + (i * 20),
                        12,
                        120,
                        {
                            isStatic: true,
                            angle: Math.PI * 0.35, // Steeper angle for high risk
                            render: { visible: false },
                            restitution: 0.95,
                            friction: 0.01,
                            collisionFilter: {
                                group: 0,
                                category: 0x0002,
                                mask: 0x0001
                            }
                        }
                    )
                );
                
                // Right side barriers in problem area
                influencers.push(
                    Matter.Bodies.rectangle(
                        centerX + 200 - (i * 15) + 30,
                        CANVAS_HEIGHT - 260 + (i * 20),
                        12,
                        120,
                        {
                            isStatic: true,
                            angle: -Math.PI * 0.35, // Steeper angle for high risk
                            render: { visible: false },
                            restitution: 0.95,
                            friction: 0.01,
                            collisionFilter: {
                                group: 0,
                                category: 0x0002,
                                mask: 0x0001
                            }
                        }
                    )
                );
            }
            
            // Add additional "capture" barriers for high risk that act as fail-safes
            influencers.push(
                Matter.Bodies.rectangle(
                    centerX - 140, 
                    CANVAS_HEIGHT - 200,
                    80,
                    8,
                    {
                        isStatic: true,
                        angle: Math.PI * 0.1, // Slight angle to guide toward center
                        render: { visible: false },
                        restitution: 0.9,
                        friction: 0.01,
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    }
                ),
                Matter.Bodies.rectangle(
                    centerX + 140, 
                    CANVAS_HEIGHT - 200,
                    80,
                    8,
                    {
                        isStatic: true,
                        angle: -Math.PI * 0.1, // Slight angle to guide toward center
                        render: { visible: false },
                        restitution: 0.9,
                        friction: 0.01,
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    }
                )
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
                // For medium risk, add funnel barriers to guide balls to the middle 3 slots
                const middleIndex = Math.floor(multipliers.length / 2);
                const middleSlots = [middleIndex - 1, middleIndex, middleIndex + 1]; // The 3 center slots
                
                // Find indices of 3x and 5x multipliers
                const easyMultiplierIndices = [];
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] === 3 || multipliers[i] === 5) {
                        easyMultiplierIndices.push(i);
                    }
                }
                
                // Add barriers to all slots except the middle 3 and with reduced strength for 3x and 5x
                for (let i = 0; i < multipliers.length; i++) {
                    // Skip the middle 3 slots
                    if (middleSlots.includes(i)) continue;
                    
                    const slotCenter = (i + 0.5) * dividerSpacing;
                    
                    // Calculate narrowing percentage - closer to center means less narrowing
                    const distanceFromMiddle = Math.min(
                        Math.abs(i - middleIndex + 1), 
                        Math.abs(i - middleIndex), 
                        Math.abs(i - middleIndex - 1)
                    );
                    
                    // Check if this is a 3x or 5x multiplier slot that we want to make easier to hit
                    const isEasyMultiplier = easyMultiplierIndices.includes(i);
                    
                    // Width reduction increases as distance from middle increases
                    // For 3x and 5x multipliers, use a lower narrowing percentage
                    let narrowingPercentage;
                    if (isEasyMultiplier) {
                        // Reduced narrowing for 3x and 5x (30-65% instead of 50-90%)
                        narrowingPercentage = Math.min(0.3 + (distanceFromMiddle * 0.07), 0.65);
                    } else {
                        // Original narrowing for other slots (50-90%)
                        narrowingPercentage = Math.min(0.5 + (distanceFromMiddle * 0.08), 0.9);
                    }
                    
                    const barrierOptions = {
                        isStatic: true,
                        render: { visible: false },
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    };
                    
                    // Add a barrier to reduce probability
                    state.walls.push(
                        Matter.Bodies.rectangle(
                            slotCenter,
                            CANVAS_HEIGHT - 40,
                            dividerSpacing * narrowingPercentage,
                            isEasyMultiplier ? 6 : 8, // Shorter barriers for 3x and 5x
                            barrierOptions
                        )
                    );
                }
                
                // Continue with existing 110x extreme barriers
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= 100) {
                        highMultiplierIndices.push(i);
                    }
                }
                
                // Add extreme barriers to 110x slots
                highMultiplierIndices.forEach(index => {
                    const slotCenter = (index + 0.5) * dividerSpacing;
                    
                    // Create a nearly complete barrier (98% width) at the 110x slot
                    const barrierOptions = {
                        isStatic: true,
                        render: { visible: false },
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    };
                    
                    // Add multiple barriers stacked vertically to make it extremely difficult
                    for (let i = 0; i < 3; i++) {
                        state.walls.push(
                            Matter.Bodies.rectangle(
                                slotCenter,
                                CANVAS_HEIGHT - 35 - (i * 20),
                                dividerSpacing * 0.98, // 98% width (nearly complete blockage)
                                6,
                                barrierOptions
                            )
                        );
                    }
                    
                    // Add an almost-invisible tiny gap to make it technically possible but extremely rare
                    state.walls.push(
                        Matter.Bodies.rectangle(
                            slotCenter - (dividerSpacing * 0.3),
                            CANVAS_HEIGHT - 45,
                            dividerSpacing * 0.35,
                            5,
                            barrierOptions
                        ),
                        Matter.Bodies.rectangle(
                            slotCenter + (dividerSpacing * 0.3),
                            CANVAS_HEIGHT - 45,
                            dividerSpacing * 0.35,
                            5,
                            barrierOptions
                        )
                    );
                });
                
                // Also add barriers to 41x and 22x slots, but less extreme
                const mediumHighMultiplierIndices = [];
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= 15 && multipliers[i] < 100) {
                        mediumHighMultiplierIndices.push(i);
                    }
                }
                
                mediumHighMultiplierIndices.forEach(index => {
                    const slotCenter = (index + 0.5) * dividerSpacing;
                    const narrowingPercentage = 0.75; // 75% width reduction
                    
                    const barrierOptions = {
                        isStatic: true,
                        render: { visible: false },
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    };
                    
                    // Add a barrier to reduce probability but not make it impossible
                    state.walls.push(
                        Matter.Bodies.rectangle(
                            slotCenter,
                            CANVAS_HEIGHT - 40,
                            dividerSpacing * narrowingPercentage,
                            6,
                            barrierOptions
                        )
                    );
                });
            } else {
                // For high, highest multipliers are at the edges (1000x, 130x)
                const highestThreshold = 100;
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= highestThreshold) {
                        highMultiplierIndices.push(i);
                    }
                }
                
                // Add extreme barriers to highest multiplier slots (1000x and 130x)
                highMultiplierIndices.forEach(index => {
                    const slotCenter = (index + 0.5) * dividerSpacing;
                    
                    // Create a nearly complete barrier at the high multiplier slot
                    const barrierOptions = {
                        isStatic: true,
                        render: { visible: false },
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    };
                    
                    // Add multiple barriers stacked vertically to make it extremely difficult
                    for (let i = 0; i < 3; i++) {
                        state.walls.push(
                            Matter.Bodies.rectangle(
                                slotCenter,
                                CANVAS_HEIGHT - 35 - (i * 20),
                                dividerSpacing * 0.97, // 97% width (nearly complete blockage)
                                6,
                                barrierOptions
                            )
                        );
                    }
                    
                    // Add an almost-invisible tiny gap to make it technically possible but extremely rare
                    state.walls.push(
                        Matter.Bodies.rectangle(
                            slotCenter - (dividerSpacing * 0.3),
                            CANVAS_HEIGHT - 45,
                            dividerSpacing * 0.35,
                            5,
                            barrierOptions
                        ),
                        Matter.Bodies.rectangle(
                            slotCenter + (dividerSpacing * 0.3),
                            CANVAS_HEIGHT - 45,
                            dividerSpacing * 0.35,
                            5,
                            barrierOptions
                        )
                    );
                });
                
                // Add barriers to medium-high multiplier slots (26x-9x)
                const mediumHighMultiplierIndices = [];
                const mediumThreshold = 6;
                
                for (let i = 0; i < multipliers.length; i++) {
                    if (multipliers[i] >= mediumThreshold && multipliers[i] < 100) {
                        mediumHighMultiplierIndices.push(i);
                    }
                }
                
                mediumHighMultiplierIndices.forEach(index => {
                    const slotCenter = (index + 0.5) * dividerSpacing;
                    const narrowingPercentage = 0.8; // 80% width reduction
                    
                    const barrierOptions = {
                        isStatic: true,
                        render: { visible: false },
                        collisionFilter: {
                            group: 0,
                            category: 0x0002,
                            mask: 0x0001
                        }
                    };
                    
                    // Add a barrier to reduce probability
                    state.walls.push(
                        Matter.Bodies.rectangle(
                            slotCenter,
                            CANVAS_HEIGHT - 40,
                            dividerSpacing * narrowingPercentage,
                            6,
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
            ballRestitution = 0.2;   // Much less bouncy (decreased from 0.35)
            ballFriction = 0.35;     // Higher friction (increased from 0.25)
            ballDensity = 0.18;      // Heavier (increased from 0.15)
        } else {
            ballRestitution = 0.2;   // Very little bounce
            ballFriction = 0.4;      // Very high friction
            ballDensity = 0.22;      // Even heavier
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
            // Medium risk - extreme bias toward center slots (0.3x, 0.5x, 0.5x)
            if (rand < 0.995) { // Increased from 0.98 - now 99.5% of balls start extremely close to center
                // Nearly all balls start very close to center with tighter constraints
                startX = CANVAS_WIDTH/2 + (Math.random() * 8 - 4); // Only ±4px from center (reduced from ±6px)
            } else if (rand < 0.999) { // Only 0.4% slightly offset
                // Very small percentage start with slight offset
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (6 + Math.random() * 8)); // Reduced from 8-18px to 6-14px
            } else {
                // Only 0.1% chance for positions that might reach high multipliers
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (20 + Math.random() * 15));
            }
        } else {
            // High risk - extreme center bias (0.2x) with virtually no chance for edge positions
            if (rand < 0.99) { // 99% of balls start extremely close to center
                // Almost all balls start extremely close to center
                startX = CANVAS_WIDTH/2 + (Math.random() * 6 - 3); // Only ±3px from center
            } else if (rand < 0.999) { // 0.9% slightly offset
                // Tiny percentage start with minimal offset
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (5 + Math.random() * 8));
            } else {
                // Only 0.1% chance (1/1000) for positions that might reach high multipliers
                const side = Math.random() > 0.5 ? 1 : -1;
                startX = CANVAS_WIDTH/2 + (side * (15 + Math.random() * 10));
            }
        }
        
        const ball = Matter.Bodies.circle(startX, 0, BALL_RADIUS, ballOptions);
        
        // Add timestamp to detect old balls
        ball.createdAt = Date.now();
        
        // Apply different central force based on risk level - all reduced by ~15%
        let centralForceMultiplier;
        if (state.risk === 'low') {
            centralForceMultiplier = 0.00017; // Reduced from 0.0002
        } else if (state.risk === 'medium') {
            centralForceMultiplier = 0.0015; // Reduced from 0.0018
        } else {
            centralForceMultiplier = 0.0016; // Reduced from 0.0020
        }
        
        // Calculate and apply initial force
        const centralForce = (CANVAS_WIDTH/2 - startX) * centralForceMultiplier;
        Matter.Body.applyForce(ball, ball.position, { 
            x: centralForce, 
            y: 0.001  // Increase downward force slightly to ensure movement
        });
        
        // Add dynamic property to make tracking easier
        ball.isActive = true;
        
        // Add to state and world
        state.activeBalls.push(ball);
        Matter.World.add(state.engine.world, ball);
        
        // Re-enable bet button to allow multiple bets
        document.getElementById('bet-button').disabled = false;
    }

    // Add this new function to apply graduated center pull forces
    function applyGraduatedCenterPull() {
        const centerX = CANVAS_WIDTH / 2;
        const multipliers = MULTIPLIERS[state.risk];
        
        // Apply to each active ball
        state.activeBalls.forEach(ball => {
            if (!ball.isActive) return;
            
            // Calculate distance from center
            const distanceFromCenter = Math.abs(ball.position.x - centerX);
            
            // Calculate force multiplier based on distance
            // The further from center, the stronger the pull, but reduced overall
            let forceFactor;
            
            if (state.risk === 'low') {
                // Low force that only kicks in further from center - reduced by ~20%
                if (distanceFromCenter < 60) { // Increased from 50 to allow more freedom
                    forceFactor = 0; // No pull when close to center
                } else if (distanceFromCenter < 150) {
                    // Linear increase from 0 to max, but reduced
                    forceFactor = 0.000032 * ((distanceFromCenter - 60) / 90); // Reduced from 0.00004
                } else {
                    forceFactor = 0.000032; // Reduced max force from 0.00004
                }
            } else if (state.risk === 'medium') {
                // Check if the ball is in a position that might lead to 3x or 5x multipliers
                const slotWidth = CANVAS_WIDTH / multipliers.length;
                const potentialSlotIndex = Math.floor(ball.position.x / slotWidth);
                
                // Get potential multiplier based on current trajectory
                let potentialMultiplier = 0;
                if (potentialSlotIndex >= 0 && potentialSlotIndex < multipliers.length) {
                    potentialMultiplier = multipliers[potentialSlotIndex];
                }
                
                // If the ball might land in a 3x or 5x slot, apply even weaker pull
                if (potentialMultiplier === 3 || potentialMultiplier === 5) {
                    if (distanceFromCenter < 60) { // Increased from 50
                        forceFactor = 0.000004; // Further reduced from 0.000005
                    } else if (distanceFromCenter < 180) { // Increased from 170
                        // Very mild quadratic increase, further reduced
                        forceFactor = 0.000004 + (0.000025 * Math.pow((distanceFromCenter - 60) / 120, 2)); // Reduced from 0.00003
                    } else {
                        forceFactor = 0.000035; // Reduced from 0.00004
                    }
                } else if (potentialMultiplier >= 10) {
                    // Allow slightly higher chance for 10x+ multipliers by reducing force by 30%
                    if (distanceFromCenter < 40) { // Increased from 30
                        forceFactor = 0.000015; // Reduced from 0.00002
                    } else if (distanceFromCenter < 160) { // Increased from 150
                        // Reduced quadratic increase
                        forceFactor = 0.000015 + (0.00006 * Math.pow((distanceFromCenter - 40) / 120, 2)); // Reduced from 0.00008
                    } else {
                        forceFactor = 0.00007; // Reduced from 0.0001
                    }
                } else {
                    // Standard medium force with graduated effect for other regions, reduced by ~25%
                    if (distanceFromCenter < 35) { // Increased from 30
                        forceFactor = 0.000015; // Reduced from 0.00002
                    } else if (distanceFromCenter < 160) { // Increased from 150
                        // Quadratic increase but reduced
                        forceFactor = 0.000015 + (0.00006 * Math.pow((distanceFromCenter - 35) / 125, 2)); // Reduced from 0.00008
                    } else {
                        forceFactor = 0.000075; // Reduced from 0.0001
                    }
                }
            } else {
                // High risk - still strong pull but reduced by ~15%
                if (distanceFromCenter < 25) { // Increased from 20
                    forceFactor = 0.000035; // Reduced from 0.00004
                } else if (distanceFromCenter < 110) { // Increased from 100
                    // Cubic increase but reduced
                    forceFactor = 0.000035 + (0.0001 * Math.pow((distanceFromCenter - 25) / 85, 3)); // Reduced from 0.00012
                    
                    // If ball is heading toward a high multiplier (9x and above), further reduce force
                    const slotWidth = CANVAS_WIDTH / multipliers.length;
                    const potentialSlotIndex = Math.floor(ball.position.x / slotWidth);
                    if (potentialSlotIndex >= 0 && potentialSlotIndex < multipliers.length) {
                        const potentialMultiplier = multipliers[potentialSlotIndex];
                        if (potentialMultiplier >= 9) {
                            forceFactor *= 0.85; // 15% reduction for high multipliers
                        }
                    }
                } else {
                    forceFactor = 0.00014; // Reduced from 0.00016
                }
            }
            
            // Calculate and apply the force
            const pullDirection = ball.position.x > centerX ? -1 : 1; // Pull toward center
            const forceMagnitude = distanceFromCenter * forceFactor;
            
            Matter.Body.applyForce(ball, ball.position, {
                x: forceMagnitude * pullDirection,
                y: 0
            });
        });
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
        // Force medium risk mode only
        e.target.value = 'medium';
        state.risk = 'medium';
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