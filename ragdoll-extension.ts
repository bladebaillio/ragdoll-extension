// ragdoll.ts
namespace ragdoll {
    export enum ConnectionType {
        //% block="spring"
        Spring = 0,
        //% block="stiff"
        Stiff = 1
    }

    class Connection {
        a: Sprite
        b: Sprite
        type: ConnectionType
        distance: number

        constructor(a: Sprite, b: Sprite, type: ConnectionType, distance: number) {
            this.a = a
            this.b = b
            this.type = type
            this.distance = distance
        }

        update(dt: number): void {
            const ax = this.a.x
            const ay = this.a.y
            const bx = this.b.x
            const by = this.b.y

            let dx = bx - ax
            let dy = by - ay
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist === 0) return

            const nx = dx / dist
            const ny = dy / dist

            if (this.type === ConnectionType.Spring) {
                const relVel = (this.b.vx - this.a.vx) * nx + (this.b.vy - this.a.vy) * ny
                const beta = 0.25
                const posError = dist - this.distance
                const bias = (beta / Math.max(dt, 1 / 120)) * posError
                let j = -(relVel + bias) / 2
                const maxImpulse = 50
                if (j > maxImpulse) j = maxImpulse
                if (j < -maxImpulse) j = -maxImpulse
                const impulseX = j * nx
                const impulseY = j * ny
                this.a.vx -= impulseX
                this.a.vy -= impulseY
                this.b.vx += impulseX
                this.b.vy += impulseY
                this.a.vx *= 0.995
                this.a.vy *= 0.995
                this.b.vx *= 0.995
                this.b.vy *= 0.995
            } else {
                const error = dist - this.distance
                if (Math.abs(error) < 0.01) return
                const correction = error * 0.5
                const correctionX = correction * nx
                const correctionY = correction * ny

                this.a.x += correctionX
                this.a.y += correctionY
                this.b.x -= correctionX
                this.b.y -= correctionY
                const relVelX = this.b.vx - this.a.vx
                const relVelY = this.b.vy - this.a.vy
                const relSpeed = relVelX * nx + relVelY * ny
                if (relSpeed > 0) {
                    const corrV = relSpeed * 0.5
                    const corrVX = corrV * nx
                    const corrVY = corrV * ny
                    this.a.vx += corrVX
                    this.a.vy += corrVY
                    this.b.vx -= corrVX
                    this.b.vy -= corrVY
                }
                this.a.vx *= 0.995
                this.a.vy *= 0.995
                this.b.vx *= 0.995
                this.b.vy *= 0.995
            }
        }
    }

    const connections: Connection[] = []


    //% blockId="ragdoll_connect"
    //% block="connect %a=variables_get(mySprite) to %b=variables_get(otherSprite) with connection type %type at distance %distance"
    //% a.shadow=variables_get
    //% b.shadow=variables_get
    //% distance.defl=20
    //% group="Ragdoll"
    export function connect(a: Sprite, b: Sprite, type: ConnectionType, distance: number): void {
        if (!a || !b) return
        connections.push(new Connection(a, b, type, Math.max(0, distance)))
    }


    //% blockId="ragdoll_removeConnections"
    //% block="remove all connections from %s=variables_get(mySprite)"
    //% group="Ragdoll"
    export function removeConnections(s: Sprite): void {
        for (let i = connections.length - 1; i >= 0; i--) {
            if (connections[i].a === s || connections[i].b === s) connections.removeAt(i)
        }
    }


    //% blockId="ragdoll_updateAll"
    //% block="update all connections"
    //% group="Ragdoll"
    export function updateAll(): void {
        const dt = 1 / 60
        const ITER = 4
        for (let it = 0; it < ITER; it++) {
            for (let c of connections) {
                if (!c.a || !c.b) continue
                c.update(dt)
            }
        }
    }
}
