//% weight=100 color=#7E58AD icon="\uf0c1"
namespace ragdoll {
    /*
     * Ragdoll connections: explicit sprite-to-sprite constraints using the same
     * verlet + spring math as softBody, but without auto-chains.
     */

    let activeRagdolls: { [id: string]: Ragdoll } = {}
    let ragdollIds: string[] = []

    interface Connection {
        a: number
        b: number
        restLength: number
        stiffness: number
        maxStretchFactor: number
        color?: number
        useLine?: boolean
        useFill?: boolean
        fillColor?: number
        clampActive?: boolean
        clampMinDeg?: number
        clampMaxDeg?: number
        clampBaseDeg?: number
        clampRef?: AngleReference
        clampTarget?: ConnectionEndpoint
        lockActive?: boolean
        lockAngleDeg?: number
        lockRef?: AngleReference
        lockTarget?: ConnectionEndpoint
    }

    export enum AngleReference {
        //% block="world"
        World,
        //% block="self"
        Self
    }

    export enum ConnectionEndpoint {
        //% block="first sprite"
        A,
        //% block="second sprite"
        B
    }

    class Ragdoll {
        public points: Sprite[] = []
        public simX: number[] = []
        public simY: number[] = []
        public oldX: number[] = []
        public oldY: number[] = []
        public isFixed: boolean[] = []
        public hasGravity: boolean = false
        public gravityStrength: number = 150
        public damping: number = 0.85
        public springStiffness: number = 0.8
        public defaultMaxStretchFactor: number = 0
        public maxSegmentVelocity: number = 0
        public lineColor: number = 1
        public shouldDrawLines: boolean = false
        public shouldFill: boolean = false
        public fillColor: number = 2
        public connections: Connection[] = []

        constructor() { }

        addSegment(sprite: Sprite): number {
            let existing = this.getIndex(sprite)
            if (existing >= 0) return existing
            this.points.push(sprite)
            this.simX.push(sprite.x)
            this.simY.push(sprite.y)
            this.oldX.push(sprite.x)
            this.oldY.push(sprite.y)
            this.isFixed.push(false)
            return this.points.length - 1
        }

        addConnection(a: number, b: number, restLength?: number, stiffness?: number, maxStretchFactor?: number): Connection {
            if (!isValidSegmentIndex(this, a) || !isValidSegmentIndex(this, b) || a === b) return null
            let dx = this.simX[b] - this.simX[a]
            let dy = this.simY[b] - this.simY[a]
            let dist = Math.sqrt(dx * dx + dy * dy)
            let length = restLength && restLength > 0 ? restLength : dist
            let conn: Connection = {
                a: a,
                b: b,
                restLength: length,
                stiffness: stiffness !== undefined ? stiffness : this.springStiffness,
                maxStretchFactor: maxStretchFactor !== undefined ? maxStretchFactor : this.defaultMaxStretchFactor
            }
            this.connections.push(conn)
            return conn
        }

        update() {
            const dt = 1 / 60
            let forces: { x: number, y: number }[] = []

            for (let i = 0; i < this.points.length; i++) {
                forces.push({ x: 0, y: 0 })
                let externalDx = this.points[i].x - this.simX[i]
                let externalDy = this.points[i].y - this.simY[i]
                if (Math.abs(externalDx) > 0.75 || Math.abs(externalDy) > 0.75) {
                    this.simX[i] = this.points[i].x
                    this.simY[i] = this.points[i].y
                    if (this.isFixed[i]) {
                        this.oldX[i] = this.simX[i]
                        this.oldY[i] = this.simY[i]
                    }
                }
            }

            this.applyConnections(forces)
            applyAngleClamps(this)
            applyAngleClamps(this)

            for (let i = 0; i < this.points.length; i++) {
                if (!this.isFixed[i]) {
                    if (this.hasGravity && this.gravityStrength !== 0) {
                        forces[i].y += this.gravityStrength * dt
                    }
                    let tempX = this.simX[i]
                    let tempY = this.simY[i]
                    let velX = (this.simX[i] - this.oldX[i]) * this.damping
                    let velY = (this.simY[i] - this.oldY[i]) * this.damping
                    let newX = this.simX[i] + velX + forces[i].x
                    let newY = this.simY[i] + velY + forces[i].y
                    if (this.maxSegmentVelocity > 0) {
                        let dx = newX - this.oldX[i]
                        let dy = newY - this.oldY[i]
                        let speed = Math.sqrt(dx * dx + dy * dy)
                        if (speed > this.maxSegmentVelocity) {
                            let scale = this.maxSegmentVelocity / speed
                            newX = this.oldX[i] + dx * scale
                            newY = this.oldY[i] + dy * scale
                        }
                    }
                    this.simX[i] = newX
                    this.simY[i] = newY
                    this.oldX[i] = tempX
                    this.oldY[i] = tempY
                } else {
                    this.oldX[i] = this.simX[i]
                    this.oldY[i] = this.simY[i]
                }
                this.points[i].x = this.simX[i]
                this.points[i].y = this.simY[i]
            }
        }

        private applyConnections(forces: { x: number, y: number }[]) {
            for (let connection of this.connections) {
                let a = connection.a
                let b = connection.b
                if (!isValidSegmentIndex(this, a) || !isValidSegmentIndex(this, b)) continue
                let ax = this.simX[a]
                let ay = this.simY[a]
                let bx = this.simX[b]
                let by = this.simY[b]
                let dx = bx - ax
                let dy = by - ay
                let distance = Math.sqrt(dx * dx + dy * dy)
                if (distance === 0) continue
                if (connection.maxStretchFactor > 0) {
                    let maxDist = connection.restLength * connection.maxStretchFactor
                    if (distance > maxDist) {
                        let excess = distance - maxDist
                        let nx = dx / distance
                        let ny = dy / distance
                        if (!this.isFixed[a] && !this.isFixed[b]) {
                            this.simX[a] += nx * excess * 0.5
                            this.simY[a] += ny * excess * 0.5
                            this.simX[b] -= nx * excess * 0.5
                            this.simY[b] -= ny * excess * 0.5
                        } else if (!this.isFixed[a]) {
                            this.simX[a] += nx * excess
                            this.simY[a] += ny * excess
                        } else if (!this.isFixed[b]) {
                            this.simX[b] -= nx * excess
                            this.simY[b] -= ny * excess
                        }
                        ax = this.simX[a]
                        ay = this.simY[a]
                        bx = this.simX[b]
                        by = this.simY[b]
                        dx = bx - ax
                        dy = by - ay
                        distance = Math.sqrt(dx * dx + dy * dy)
                        if (distance === 0) continue
                    }
                }

                let diff = connection.restLength - distance
                let stiffness = connection.stiffness !== undefined ? connection.stiffness : this.springStiffness
                let force = (diff / distance) * stiffness
                let forceX = dx * force
                let forceY = dy * force

                if (!this.isFixed[a]) {
                    forces[a].x -= forceX
                    forces[a].y -= forceY
                }
                if (!this.isFixed[b]) {
                    forces[b].x += forceX
                    forces[b].y += forceY
                }
            }
        }

        setSegmentGravity(index: number, hasGravity: boolean) {
            if (isValidSegmentIndex(this, index)) {
                this.isFixed[index] = !hasGravity
            }
        }

        setSegmentPosition(index: number, x: number, y: number) {
            if (isValidSegmentIndex(this, index)) {
                this.points[index].x = x
                this.points[index].y = y
                this.simX[index] = x
                this.simY[index] = y
                this.oldX[index] = x
                this.oldY[index] = y
            }
        }

        setLocked(locked: boolean) {
            for (let i = 0; i < this.isFixed.length; i++) {
                this.isFixed[i] = locked
            }
        }

        setDefaultMaxStretch(factor: number) {
            this.defaultMaxStretchFactor = Math.max(0, factor)
        }

        getIndex(sprite: Sprite): number {
            if (!sprite) return -1
            let targetId = sprite.id
            for (let i = 0; i < this.points.length; i++) {
                if (this.points[i].id === targetId) {
                    return i
                }
            }
            return -1
        }
    }

    function isValidSegmentIndex(body: Ragdoll, index: number): boolean {
        if (!body) return false
        return index >= 0 && index < body.points.length
    }

    function findRagdollForConnection(connection: Connection): Ragdoll {
        for (let i = 0; i < ragdollIds.length; i++) {
            let body = activeRagdolls[ragdollIds[i]]
            if (body.connections.indexOf(connection) !== -1) return body
        }
        return null
    }

    function normalizeDeg(angle: number): number {
        let a = angle % 360
        if (a > 180) a -= 360
        if (a < -180) a += 360
        return a
    }

    function clampAngleRange(currentDeg: number, baseDeg: number, minDeg: number, maxDeg: number): number {
        let delta = normalizeDeg(currentDeg - baseDeg)
        if (delta < minDeg) delta = minDeg
        if (delta > maxDeg) delta = maxDeg
        return normalizeDeg(baseDeg + delta)
    }

    const CLAMP_RELAX = 0.35
    const CLAMP_MAX_MOVE_RATIO = 0.5

    function applyAngleClamps(rag: Ragdoll) {
        for (let i = 0; i < rag.connections.length; i++) {
            let c = rag.connections[i]
            if (!c.clampActive || c.clampBaseDeg === undefined || c.clampMinDeg === undefined || c.clampMaxDeg === undefined) continue
            let a = c.a
            let b = c.b
            if (!isValidSegmentIndex(rag, a) || !isValidSegmentIndex(rag, b)) continue

            let ax = rag.simX[a]
            let ay = rag.simY[a]
            let bx = rag.simX[b]
            let by = rag.simY[b]
            let dx = bx - ax
            let dy = by - ay
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist === 0) continue

            let angleDeg = Math.atan2(dy, dx) * 57.296
            let baseDeg = c.clampRef === AngleReference.Self ? c.clampBaseDeg : 0
            let targetDeg = clampAngleRange(angleDeg, baseDeg, c.clampMinDeg, c.clampMaxDeg)
            if (Math.abs(normalizeDeg(angleDeg - targetDeg)) < 0.001) continue

            let nx = Math.cos(targetDeg / 57.296)
            let ny = Math.sin(targetDeg / 57.296)
            let desiredBx = ax + nx * dist
            let desiredBy = ay + ny * dist

            let moveX = desiredBx - bx
            let moveY = desiredBy - by
            moveX *= CLAMP_RELAX
            moveY *= CLAMP_RELAX
            let moveLen = Math.sqrt(moveX * moveX + moveY * moveY)
            let maxMove = dist * CLAMP_MAX_MOVE_RATIO
            if (moveLen > maxMove && moveLen > 0) {
                let s = maxMove / moveLen
                moveX *= s
                moveY *= s
            }

            let targetEndpoint = c.clampTarget !== undefined ? c.clampTarget : ConnectionEndpoint.B
            if (targetEndpoint === ConnectionEndpoint.B) {
                let bFixed = rag.isFixed[b]
                if (!bFixed) {
                    rag.simX[b] = desiredBx
                    rag.simY[b] = desiredBy
                } else if (!rag.isFixed[a]) {
                    rag.simX[a] -= moveX
                    rag.simY[a] -= moveY
                }
            } else {
                let aFixed = rag.isFixed[a]
                if (!aFixed) {
                    rag.simX[a] = ax - moveX
                    rag.simY[a] = ay - moveY
                } else if (!rag.isFixed[b]) {
                    rag.simX[b] = desiredBx
                    rag.simY[b] = desiredBy
                }
            }

        }
    }

    function getOrCreateRagdoll(id: string): Ragdoll {
        let key = id || "__default"
        if (!activeRagdolls[key]) {
            activeRagdolls[key] = new Ragdoll()
            ragdollIds.push(key)
        }
        return activeRagdolls[key]
    }

    function updateAllRagdolls() {
        for (let i = 0; i < ragdollIds.length; i++) {
            activeRagdolls[ragdollIds[i]].update()
        }
    }

    function findConnection(rag: Ragdoll, spriteA: Sprite, spriteB: Sprite): Connection {
        if (!rag) return null
        let a = rag.getIndex(spriteA)
        let b = rag.getIndex(spriteB)
        if (a < 0 || b < 0) return null
        for (let i = 0; i < rag.connections.length; i++) {
            let c = rag.connections[i]
            if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) {
                return c
            }
        }
        return null
    }

    function drawRagdollLines(rag: Ragdoll, target: Image, offsetX: number, offsetY: number) {
        if (!rag || !target) return
        for (let i = 0; i < rag.connections.length; i++) {
            let c = rag.connections[i]
            let shouldDraw = (c.useLine === true) || (c.useLine === undefined && rag.shouldDrawLines)
            if (!shouldDraw) continue
            let ax = rag.points[c.a].x - offsetX
            let ay = rag.points[c.a].y - offsetY
            let bx = rag.points[c.b].x - offsetX
            let by = rag.points[c.b].y - offsetY
            let color = c.color !== undefined ? c.color : rag.lineColor
            target.drawLine(ax, ay, bx, by, color)
        }
    }

    function drawRagdollFill(rag: Ragdoll, target: Image, offsetX: number, offsetY: number) {
        if (!rag || !target) return
        for (let i = 0; i < rag.connections.length; i++) {
            let c = rag.connections[i]
            let shouldFill = (c.useFill === true) || (c.useFill === undefined && rag.shouldFill)
            if (c.useFill === false) shouldFill = false
            if (!shouldFill) continue
            let color = c.fillColor !== undefined ? c.fillColor : rag.fillColor
            fillConnection(rag, c, target, offsetX, offsetY, color)
        }
    }

    function fillTriangle(img: Image, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: number) {
        x1 = Math.round(x1); y1 = Math.round(y1)
        x2 = Math.round(x2); y2 = Math.round(y2)
        x3 = Math.round(x3); y3 = Math.round(y3)
        if (y1 > y2) { let tx = x1; let ty = y1; x1 = x2; y1 = y2; x2 = tx; y2 = ty }
        if (y2 > y3) { let tx = x2; let ty = y2; x2 = x3; y2 = y3; x3 = tx; y3 = ty }
        if (y1 > y2) { let tx = x1; let ty = y1; x1 = x2; y1 = y2; x2 = tx; y2 = ty }
        if (y3 < 0 || y1 >= img.height) return
        let startY = Math.max(0, y1)
        let endY = Math.min(img.height - 1, y3)
        let dx13 = y3 - y1 !== 0 ? (x3 - x1) / (y3 - y1) : 0
        let dx12 = y2 - y1 !== 0 ? (x2 - x1) / (y2 - y1) : 0
        let dx23 = y3 - y2 !== 0 ? (x3 - x2) / (y3 - y2) : 0
        for (let y = startY; y <= endY; y++) {
            let sx: number; let ex: number
            if (y < y2) {
                sx = x1 + dx13 * (y - y1)
                ex = x1 + dx12 * (y - y1)
            } else {
                sx = x1 + dx13 * (y - y1)
                ex = x2 + dx23 * (y - y2)
            }
            if (sx > ex) { let t = sx; sx = ex; ex = t }
            sx = Math.max(0, Math.min(img.width - 1, Math.round(sx)))
            ex = Math.max(0, Math.min(img.width - 1, Math.round(ex)))
            for (let x = sx; x <= ex; x++) {
                img.setPixel(x, y, color)
            }
        }
    }

    function fillConnection(rag: Ragdoll, conn: Connection, target: Image, offsetX: number, offsetY: number, color: number) {
        if (!rag || !target || !conn) return
        let a = conn.a
        let b = conn.b
        if (!isValidSegmentIndex(rag, a) || !isValidSegmentIndex(rag, b)) return
        let ax = rag.points[a].x - offsetX
        let ay = rag.points[a].y - offsetY
        let bx = rag.points[b].x - offsetX
        let by = rag.points[b].y - offsetY
        let dx = bx - ax
        let dy = by - ay
        let len = Math.sqrt(dx * dx + dy * dy)
        if (len === 0) return
        let nx = dx / len
        let ny = dy / len
        let px = -ny
        let py = nx
        let halfA = Math.max(1, rag.points[a].width / 2)
        let halfB = Math.max(1, rag.points[b].width / 2)
        let axL = ax + px * halfA
        let ayL = ay + py * halfA
        let axR = ax - px * halfA
        let ayR = ay - py * halfA
        let bxL = bx + px * halfB
        let byL = by + py * halfB
        let bxR = bx - px * halfB
        let byR = by - py * halfB
        fillTriangle(target, axL, ayL, bxL, byL, bxR, byR, color)
        fillTriangle(target, axL, ayL, bxR, byR, axR, ayR, color)
    }
    //% block="connect $spriteA to $spriteB distance $restLength on ragdoll $ragdollId"
    //% spriteA.shadow=variables_get spriteB.shadow=variables_get ragdollId.shadow=text
    //% restLength.defl=0
    //% group="Creation"
    export function connectSprites(spriteA: Sprite, spriteB: Sprite, restLength: number, ragdollId: string) {
        let rag = getOrCreateRagdoll(ragdollId)
        rag.addSegment(spriteA)
        rag.addSegment(spriteB)
        let aIndex = rag.getIndex(spriteA)
        let bIndex = rag.getIndex(spriteB)
        rag.addConnection(aIndex, bIndex, restLength)
    }

    //% block="disconnect $spriteA from $spriteB in ragdoll $ragdollId"
    //% spriteA.shadow=variables_get spriteB.shadow=variables_get ragdollId.shadow=text
    //% group="Modify"
    export function disconnectSprites(spriteA: Sprite, spriteB: Sprite, ragdollId: string) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        let a = rag.getIndex(spriteA)
        let b = rag.getIndex(spriteB)
        if (a < 0 || b < 0) return
        rag.connections = rag.connections.filter(c => !((c.a === a && c.b === b) || (c.a === b && c.b === a)))
    }

    //% block="disconnect all connections from $sprite in ragdoll $ragdollId"
    //% sprite.shadow=variables_get ragdollId.shadow=text
    //% group="Modify"
    export function disconnectAllFromSprite(sprite: Sprite, ragdollId: string) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        let idx = rag.getIndex(sprite)
        if (idx < 0) return
        rag.connections = rag.connections.filter(c => c.a !== idx && c.b !== idx)
    }

    //% block="set ragdoll $ragdollId damping to $value"
    //% ragdollId.shadow=text
    //% value.defl=0.85 value.min=0 value.max=1
    //% group="Modify"
    export function setDamping(ragdollId: string, value: number) {
        let rag = getOrCreateRagdoll(ragdollId)
        rag.damping = value
    }

    //% block="set ragdoll $ragdollId spring stiffness to $value"
    //% ragdollId.shadow=text
    //% value.defl=0.8 value.min=0 value.max=2
    //% group="Modify"
    export function setSpringStiffness(ragdollId: string, value: number) {
        let rag = getOrCreateRagdoll(ragdollId)
        rag.springStiffness = value
    }

    //% block="set ragdoll $ragdollId max velocity to $value"
    //% ragdollId.shadow=text
    //% value.defl=80 value.min=0
    //% group="Modify"
    export function setMaxVelocity(ragdollId: string, value: number) {
        let rag = getOrCreateRagdoll(ragdollId)
        rag.maxSegmentVelocity = Math.max(0, value)
    }

    //% block="set ragdoll $ragdollId gravity to $value"
    //% ragdollId.shadow=text
    //% value.defl=150 value.min=0
    //% group="Modify"
    export function setGravity(ragdollId: string, value: number) {
        let rag = getOrCreateRagdoll(ragdollId)
        rag.hasGravity = value !== 0
        rag.gravityStrength = value
    }

    //% block="update all connections"
    //% group="Update"
    export function updateAllConnections() {
        updateAllRagdolls()
    }

    //% block="update connection between $spriteA and $spriteB in ragdoll $ragdollId"
    //% spriteA.shadow=variables_get spriteB.shadow=variables_get ragdollId.shadow=text
    //% group="Update"
    export function updateConnectionBetweenSprites(spriteA: Sprite, spriteB: Sprite, ragdollId: string) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        rag.update()
    }

    //% block="update ragdoll $ragdollId connections"
    //% ragdollId.shadow=text
    //% group="Update"
    export function updateRagdoll(ragdollId: string) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        rag.update()
    }

    //% block="connection count from $sprite in ragdoll $ragdollId"
    //% sprite.shadow=variables_get ragdollId.shadow=text
    //% group="Query"
    export function getConnectionCount(sprite: Sprite, ragdollId: string): number {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return 0
        let idx = rag.getIndex(sprite)
        if (idx < 0) return 0
        let count = 0
        for (let i = 0; i < rag.connections.length; i++) {
            let c = rag.connections[i]
            if (c.a === idx || c.b === idx) count++
        }
        return count
    }

    //% block="ragdoll names"
    //% blockSetVariable=names
    //% group="Query"
    export function getRagdollNames(): string[] {
        let result: string[] = []
        for (let i = 0; i < ragdollIds.length; i++) {
            result.push(ragdollIds[i])
        }
        return result
    }

    //% block="$spriteA connected to $spriteB in ragdoll $ragdollId"
    //% spriteA.shadow=variables_get spriteB.shadow=variables_get ragdollId.shadow=text
    //% group="Query"
    export function spritesAreConnected(spriteA: Sprite, spriteB: Sprite, ragdollId: string): boolean {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return false
        let a = rag.getIndex(spriteA)
        let b = rag.getIndex(spriteB)
        if (a < 0 || b < 0) return false
        for (let i = 0; i < rag.connections.length; i++) {
            let c = rag.connections[i]
            if ((c.a === a && c.b === b) || (c.a === b && c.b === a)) {
                return true
            }
        }
        return false
    }
    //% block="render ragdoll $ragdollId on image $target"
    //% ragdollId.shadow=text target.shadow=variables_get
    //% group="Render"
    export function renderRagdoll(ragdollId: string, target: Image) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag || !target) return
        drawRagdollFill(rag, target, 0, 0)
        drawRagdollLines(rag, target, 0, 0)
    }

    //% block="render all ragdolls on image $target"
    //% target.shadow=variables_get
    //% group="Render"
    export function renderAllRagdollsOnImage(target: Image) {
        if (!target) return
        for (let i = 0; i < ragdollIds.length; i++) {
            let rag = activeRagdolls[ragdollIds[i]]
            drawRagdollFill(rag, target, 0, 0)
            drawRagdollLines(rag, target, 0, 0)
        }
    }

    //% block="render ragdoll $ragdollId on sprite $spriteTarget"
    //% ragdollId.shadow=text spriteTarget.shadow=variables_get
    //% group="Render"
    export function renderRagdollOnSprite(ragdollId: string, spriteTarget: Sprite) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag || !spriteTarget || !spriteTarget.image) return
        let offsetX = spriteTarget.x - spriteTarget.image.width / 2
        let offsetY = spriteTarget.y - spriteTarget.image.height / 2
        drawRagdollFill(rag, spriteTarget.image, offsetX, offsetY)
        drawRagdollLines(rag, spriteTarget.image, offsetX, offsetY)
    }

    //% block="render all ragdolls on sprite $spriteTarget"
    //% spriteTarget.shadow=variables_get
    //% group="Render"
    export function renderAllRagdollsOnSprite(spriteTarget: Sprite) {
        if (!spriteTarget || !spriteTarget.image) return
        let offsetX = spriteTarget.x - spriteTarget.image.width / 2
        let offsetY = spriteTarget.y - spriteTarget.image.height / 2
        for (let i = 0; i < ragdollIds.length; i++) {
            let rag = activeRagdolls[ragdollIds[i]]
            drawRagdollFill(rag, spriteTarget.image, offsetX, offsetY)
            drawRagdollLines(rag, spriteTarget.image, offsetX, offsetY)
        }
    }

    //% block="draw lines between connections of ragdoll $ragdollId with color $color"
    //% ragdollId.shadow=text color.defl=1
    //% group="Modify"
    export function setLineColor(ragdollId: string, color: number) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        rag.lineColor = color
        rag.shouldDrawLines = true
    }

    //% block="fill connections of ragdoll $ragdollId with color $color"
    //% ragdollId.shadow=text color.defl=2
    //% group="Modify"
    export function setFillBetweenConnections(ragdollId: string, color: number) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        rag.fillColor = color
        rag.shouldFill = true
    }

    //% block="fill connection between $spriteA and $spriteB of ragdoll $ragdollId with color $color"
    //% spriteA.shadow=variables_get spriteB.shadow=variables_get ragdollId.shadow=text color.defl=2
    //% group="Modify"
    export function fillConnectionBetweenSprites(spriteA: Sprite, spriteB: Sprite, ragdollId: string, color: number) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        let conn = findConnection(rag, spriteA, spriteB)
        if (!conn) return
        conn.useFill = true
        conn.fillColor = color
    }

    //% block="draw line between $spriteA and $spriteB of ragdoll $ragdollId with color $color"
    //% spriteA.shadow=variables_get spriteB.shadow=variables_get ragdollId.shadow=text color.defl=1
    //% group="Modify"
    export function drawLineBetweenSprites(spriteA: Sprite, spriteB: Sprite, ragdollId: string, color: number) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        let conn = findConnection(rag, spriteA, spriteB)
        if (!conn) return
        conn.useLine = true
        conn.color = color
        conn.useFill = false
    }

    //% block="clamp connection $spriteA to $spriteB in ragdoll $ragdollId between min $minDeg max $maxDeg degrees reference $reference target $targetEnd"
    //% spriteA.shadow=variables_get spriteB.shadow=variables_get ragdollId.shadow=text minDeg.defl=-45 maxDeg.defl=45 reference.defl=AngleReference.Self targetEnd.defl=ConnectionEndpoint.B
    //% group="Modify"
    export function setConnectionAngleClamp(spriteA: Sprite, spriteB: Sprite, ragdollId: string, minDeg: number, maxDeg: number, reference: AngleReference, targetEnd: ConnectionEndpoint) {
        let rag = activeRagdolls[ragdollId || "__default"]
        if (!rag) return
        let conn = findConnection(rag, spriteA, spriteB)
        if (!conn) return
        if (minDeg === 0 && maxDeg === 0) {
            conn.clampActive = false
            return
        }
        let lo = minDeg
        let hi = maxDeg
        if (lo > hi) { let t = lo; lo = hi; hi = t }
        if (hi - lo >= 360) { conn.clampActive = false; return }
        let a = rag.getIndex(spriteA)
        let b = rag.getIndex(spriteB)
        if (a < 0 || b < 0) return
        let dx = rag.simX[b] - rag.simX[a]
        let dy = rag.simY[b] - rag.simY[a]
        let baseAngle = Math.atan2(dy, dx) * 57.296
        conn.clampActive = true
        conn.clampMinDeg = lo
        conn.clampMaxDeg = hi
        conn.clampRef = reference
        conn.clampBaseDeg = reference === AngleReference.Self ? baseAngle : 0
        conn.clampTarget = targetEnd
    }
}



