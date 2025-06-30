"use client"

import { useEffect, useRef } from "react"

const BIG_PARTICLE_THRESHOLD = 3.5; // Size to be considered "big"

interface Spark {
  x: number
  y: number
  size: number
  color: string
  life: number // How long the spark lasts
  speedX: number
  speedY: number
}

export function BackgroundAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sparksRef = useRef<Spark[]>([]) // Ref to store sparks

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const sparks = sparksRef.current // Get the sparks array from ref

    // Set canvas dimensions
    const setCanvasDimensions = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    setCanvasDimensions()
    // window.addEventListener("resize", setCanvasDimensions) // Replaced by debounced version

    // Create particles
    const particlesArray: Particle[] = []
    const numberOfParticles = Math.min(50, Math.floor(window.innerWidth / 30))

    class Particle {
      x: number
      y: number
      size: number
      speedX: number
      speedY: number
      color: string
      mass: number
      isBig: boolean

      constructor() {
        this.x = Math.random() * canvas!.width
        this.y = Math.random() * canvas!.height
        this.size = Math.random() * 5 + 1
        this.speedX = (Math.random() * 1 - 0.5) * 0.5 // Slower speeds
        this.speedY = (Math.random() * 1 - 0.5) * 0.5 // Slower speeds
        this.mass = this.size * this.size // Mass proportional to area
        this.isBig = this.size > BIG_PARTICLE_THRESHOLD

        // Pastel colors
        const colors = [
          "rgba(159, 122, 234, 0.7)", // Purple
          "rgba(237, 100, 166, 0.7)", // Pink
          "rgba(79, 209, 197, 0.7)", // Teal
          "rgba(56, 178, 172, 0.7)", // Emerald
          "rgba(66, 153, 225, 0.7)", // Blue
        ]
        this.color = colors[Math.floor(Math.random() * colors.length)]
      }

      update() {
        this.x += this.speedX
        this.y += this.speedY

        // Wall collision (bounce)
        if (this.x + this.size > canvas!.width || this.x - this.size < 0) {
          this.speedX *= -1
          if (this.x + this.size > canvas!.width) this.x = canvas!.width - this.size
          if (this.x - this.size < 0) this.x = this.size
        }
        if (this.y + this.size > canvas!.height || this.y - this.size < 0) {
          this.speedY *= -1
          if (this.y + this.size > canvas!.height) this.y = canvas!.height - this.size
          if (this.y - this.size < 0) this.y = this.size
        }
      }

      draw() {
        ctx!.beginPath()
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        ctx!.fillStyle = this.color
        ctx!.fill()
      }
    }

    function createSpark(x: number, y: number) {
      const life = 30 + Math.random() * 30 // Spark lasts for 30-60 frames
      const size = Math.random() * 1.5 + 0.5
      const angle = Math.random() * Math.PI * 2
      const speed = Math.random() * 1 + 0.5
      sparks.push({
        x,
        y,
        size,
        color: "rgba(255, 255, 224, 0.9)", // Light yellow/white spark
        life,
        speedX: Math.cos(angle) * speed,
        speedY: Math.sin(angle) * speed,
      })
    }

    function handleParticleCollisions() {
      for (let i = 0; i < particlesArray.length; i++) {
        for (let j = i + 1; j < particlesArray.length; j++) {
          const p1 = particlesArray[i]
          const p2 = particlesArray[j]

          const dx = p2.x - p1.x
          const dy = p2.y - p1.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < p1.size + p2.size) {
            // Collision detected
            if (p1.isBig && p2.isBig) {
              // Create spark at collision point (midpoint)
              createSpark(p1.x + dx / 2, p1.y + dy / 2)
            }

            // Resolve collision (elastic collision formula)
            const nx = dx / distance // Normal x
            const ny = dy / distance // Normal y

            const kx = p1.speedX - p2.speedX
            const ky = p1.speedY - p2.speedY
            const p = (2 * (nx * kx + ny * ky)) / (p1.mass + p2.mass)

            const v1x = p1.speedX - p * p2.mass * nx
            const v1y = p1.speedY - p * p2.mass * ny
            const v2x = p2.speedX + p * p1.mass * nx
            const v2y = p2.speedY + p * p1.mass * ny

            p1.speedX = v1x
            p1.speedY = v1y
            p2.speedX = v2x
            p2.speedY = v2y

            // Positional correction to prevent overlap
            const overlap = 0.5 * (p1.size + p2.size - distance + 1) // +1 to give a little push
            p1.x -= overlap * nx
            p1.y -= overlap * ny
            p2.x += overlap * nx
            p2.y += overlap * ny
          }
        }
      }
    }
    
    function updateAndDrawSparks() {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.x += s.speedX
        s.y += s.speedY
        s.life -= 1
        s.size *= 0.98 // Shrink spark

        if (s.life <= 0 || s.size < 0.1) {
          sparks.splice(i, 1) // Remove dead spark
        } else {
          ctx!.beginPath()
          ctx!.arc(s.x, s.y, s.size, 0, Math.PI * 2)
          ctx!.fillStyle = s.color.replace(/\d\.\d+\)/, `${s.life / 60 * 0.9})`) // Fade out
          ctx!.fill()
        }
      }
    }

    function init() {
      particlesArray.length = 0 // Clear existing particles if any (for resize)
      sparks.length = 0 // Clear sparks on init
      for (let i = 0; i < numberOfParticles; i++) {
        particlesArray.push(new Particle())
      }
    }

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

      for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update()
        particlesArray[i].draw()
      }
      
      handleParticleCollisions()
      updateAndDrawSparks()

      connectParticles() // Keep existing line connections

      requestAnimationFrame(animate)
    }

    function connectParticles() {
      for (let a = 0; a < particlesArray.length; a++) {
        for (let b = a + 1; b < particlesArray.length; b++) { // Start b from a + 1
          const dx = particlesArray[a].x - particlesArray[b].x
          const dy = particlesArray[a].y - particlesArray[b].y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 150) { // Reduced connection distance for clarity
            const opacity = 1 - distance / 150
            ctx!.strokeStyle = `rgba(150, 150, 255, ${opacity * 0.15})` // Reduced opacity further
            ctx!.lineWidth = 0.5 // Thinner lines
            ctx!.beginPath()
            ctx!.moveTo(particlesArray[a].x, particlesArray[a].y)
            ctx!.lineTo(particlesArray[b].x, particlesArray[b].y)
            ctx!.stroke()
          }
        }
      }
    }

    init()
    animate()

    // Debounce resize handler for init
    let resizeTimeout: NodeJS.Timeout
    const debouncedSetCanvasDimensions = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        setCanvasDimensions()
        init() // Re-initialize particles on resize
      }, 250)
    }

    window.addEventListener("resize", debouncedSetCanvasDimensions)

    return () => {
      window.removeEventListener("resize", debouncedSetCanvasDimensions)
      // Also clear animation frame if you store its ID
    }
  }, []) // Empty dependency array ensures this runs once on mount

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />
}
