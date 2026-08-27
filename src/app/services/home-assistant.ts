import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export interface HALight {
  entityId: string;
  name: string;
  state: 'on' | 'off' | 'unavailable' | 'unknown';
  attributes: Record<string, any>;
}

export interface MmWaveTarget {
  x: number | null;
  y: number | null;
}

export interface ApolloTargets {
  target1: MmWaveTarget;
  target2: MmWaveTarget;
  target3: MmWaveTarget;
}

type TargetName = 'target1' | 'target2' | 'target3';

@Injectable({
  providedIn: 'root',
})
export class HomeAssistantService {
  private ws: WebSocket | null = null;
  private messageId = 1;

  private readonly haUrl = 'ws://192.168.0.236/api/websocket';

  // DO NOT commit your real token to Git.
  private readonly token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI4ZTZmZjIwMGQ0ZTg0NzNmYmFlZjhjNTg5NTBjZjEyZSIsImlhdCI6MTc4NzM1NDY3OCwiZXhwIjoyMTAyNzE0Njc4fQ.T6WaSThgNU365KiDP6VYZf0sJvzrRUYDyPrOiydyaRs';

  private states = new Map<string, HAState>();

  private readonly lightsSubject = new BehaviorSubject<HALight[]>([]);

  readonly lights$ = this.lightsSubject.asObservable();

  // ==================================================
  // APOLLO
  // ==================================================

  private apolloTargetCount = 0;

  private readonly apolloPresenceEntity =
    'sensor.apollo_r_pro_1_ede2ac_ld2450_presence_target_count';

  private readonly apolloEntities = new Set([
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_x',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_y',

    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_x',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_y',

    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_x',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_y',

    'sensor.apollo_r_pro_1_ede2ac_ld2450_presence_target_count',
  ]);

  // ==================================================
  // MOVEMENT SETTINGS
  // ==================================================

  /*
   * While INACTIVE:
   *
   * Movement must exceed this distance before
   * the target becomes visible.
   *
   * This filters the normal LD2450 wall/static noise.
   */
  private readonly activationThreshold = 6;

  /*
   * Once active, we allow tiny movements.
   *
   * The target remains active until there has been
   * no meaningful movement for this amount of time.
   */
  private readonly inactiveTimeout = 5000;

  // ==================================================
  // RAW APOLLO POSITIONS
  // ==================================================

  private apolloRawPositions: Record<TargetName, MmWaveTarget> = {
    target1: {
      x: null,
      y: null,
    },

    target2: {
      x: null,
      y: null,
    },

    target3: {
      x: null,
      y: null,
    },
  };

  // ==================================================
  // INACTIVE REFERENCE
  //
  // This is the position used to determine whether
  // enough movement occurred to wake up the target.
  //
  // IMPORTANT:
  //
  // This does NOT change with every noisy reading.
  // ==================================================

  private apolloActivationReference: Record<TargetName, MmWaveTarget> = {
    target1: {
      x: null,
      y: null,
    },

    target2: {
      x: null,
      y: null,
    },

    target3: {
      x: null,
      y: null,
    },
  };

  // ==================================================
  // DISPLAYED POSITIONS
  // ==================================================

  private apolloTargets: ApolloTargets = {
    target1: {
      x: null,
      y: null,
    },

    target2: {
      x: null,
      y: null,
    },

    target3: {
      x: null,
      y: null,
    },
  };

  readonly apolloTargets$ = new BehaviorSubject<ApolloTargets>({
    target1: {
      x: null,
      y: null,
    },

    target2: {
      x: null,
      y: null,
    },

    target3: {
      x: null,
      y: null,
    },
  });

  // ==================================================
  // VISIBILITY
  // ==================================================

  private apolloVisible: Record<TargetName, boolean> = {
    target1: false,
    target2: false,
    target3: false,
  };

  // ==================================================
  // LAST REAL MOVEMENT
  //
  // This is ONLY updated when the target is active.
  //
  // Every valid coordinate update while active counts
  // as continued tracking.
  // ==================================================

  private apolloLastMovement: Record<TargetName, number> = {
    target1: 0,
    target2: 0,
    target3: 0,
  };

  // ==================================================
  // INITIAL STATE REQUEST
  // ==================================================

  private readonly getStatesRequestId = 1000000;

  // ==================================================
  // PUBLIC ACCESS
  // ==================================================

  getApolloTargets(): ApolloTargets {
    return {
      target1: {
        ...this.apolloTargets.target1,
      },

      target2: {
        ...this.apolloTargets.target2,
      },

      target3: {
        ...this.apolloTargets.target3,
      },
    };
  }

  // ==================================================
  // EMIT
  // ==================================================

  private emitApolloTargets(): void {
    this.apolloTargets$.next({
      target1: {
        ...this.apolloTargets.target1,
      },

      target2: {
        ...this.apolloTargets.target2,
      },

      target3: {
        ...this.apolloTargets.target3,
      },
    });
  }

  // ==================================================
  // CLEAR TARGET
  // ==================================================

  private clearApolloTarget(targetName: TargetName): void {
    if (!this.apolloVisible[targetName]) {
      return;
    }

    console.log(`APOLLO ${targetName}: inactive -> hiding`);

    this.apolloVisible[targetName] = false;

    this.apolloTargets[targetName] = {
      x: null,
      y: null,
    };

    this.apolloLastMovement[targetName] = 0;

    /*
     * IMPORTANT:
     *
     * Do NOT immediately replace the activation reference
     * with every noisy coordinate.
     *
     * We keep the current reference so that the next
     * movement has to exceed 6 inches.
     */

    this.emitApolloTargets();
  }

  // ==================================================
  // CLEAR ALL
  // ==================================================

  private clearAllApolloTargets(): void {
    let changed = false;

    for (const targetName of ['target1', 'target2', 'target3'] as const) {
      if (
        this.apolloVisible[targetName] ||
        this.apolloTargets[targetName].x !== null ||
        this.apolloTargets[targetName].y !== null
      ) {
        changed = true;
      }

      this.apolloVisible[targetName] = false;

      this.apolloTargets[targetName] = {
        x: null,
        y: null,
      };

      this.apolloLastMovement[targetName] = 0;
    }

    if (changed) {
      console.log('APOLLO: no presence -> cleared');

      this.emitApolloTargets();
    }
  }

  // ==================================================
  // CHECK ACTIVE TARGETS
  //
  // This runs periodically.
  //
  // Once active, the target gets 5 seconds from the
  // most recent coordinate update before disappearing.
  // ==================================================

  private checkApolloTargets(): void {
    const now = Date.now();

    for (const targetName of ['target1', 'target2', 'target3'] as const) {
      if (!this.apolloVisible[targetName]) {
        continue;
      }

      const lastMovement = this.apolloLastMovement[targetName];

      if (lastMovement === 0) {
        continue;
      }

      if (now - lastMovement >= this.inactiveTimeout) {
        this.clearApolloTarget(targetName);
      }
    }
  }

  // ==================================================
  // PROCESS POSITION
  // ==================================================

  private processApolloPosition(targetName: TargetName): void {
    const raw = this.apolloRawPositions[targetName];

    if (raw.x === null || raw.y === null) {
      return;
    }

    const now = Date.now();

    // ==================================================
    // TARGET CURRENTLY ACTIVE
    // ==================================================

    if (this.apolloVisible[targetName]) {
      /*
       * THIS IS THE IMPORTANT PART.
       *
       * Once a person has activated the target,
       * EVERY coordinate update is accepted.
       *
       * We do NOT apply the 6 inch filter anymore.
       *
       * Therefore:
       *
       * 10.0 -> 10.2
       * 10.2 -> 10.1
       * 10.1 -> 10.4
       *
       * all get displayed.
       */

      const oldX = this.apolloTargets[targetName].x;

      const oldY = this.apolloTargets[targetName].y;

      this.apolloTargets[targetName] = {
        x: raw.x,
        y: raw.y,
      };

      /*
       * Every coordinate update while active
       * keeps the target alive.
       *
       * This gives us the 5 second disappearance
       * timer after updates stop.
       */
      this.apolloLastMovement[targetName] = now;

      if (oldX !== raw.x || oldY !== raw.y) {
        this.emitApolloTargets();
      }

      return;
    }

    // ==================================================
    // TARGET CURRENTLY INACTIVE
    // ==================================================

    let reference = this.apolloActivationReference[targetName];

    // ==================================================
    // FIRST POSITION EVER
    // ==================================================

    if (reference.x === null || reference.y === null) {
      /*
       * Establish the baseline.
       *
       * DO NOT DISPLAY IT.
       *
       * This is critical because static wall noise
       * should not create a dot.
       */

      this.apolloActivationReference[targetName] = {
        x: raw.x,
        y: raw.y,
      };

      console.log(`APOLLO ${targetName}: baseline established`, raw);

      return;
    }

    // ==================================================
    // CHECK ACTIVATION MOVEMENT
    // ==================================================

    const dx = raw.x - reference.x;
    const dy = raw.y - reference.y;

    const distance = Math.hypot(dx, dy);

    /*
     * Static/noise movement.
     *
     * Do absolutely nothing.
     *
     * Most importantly:
     *
     * DO NOT move the reference.
     *
     * This means noise cannot slowly "walk" the
     * reference around until it eventually activates.
     */

    if (distance <= this.activationThreshold) {
      return;
    }

    // ==================================================
    // REAL MOVEMENT -> ACTIVATE
    // ==================================================

    console.log(`APOLLO ${targetName}: REAL MOVEMENT -> ACTIVE`, {
      from: reference,
      to: raw,
      distance,
    });

    this.apolloVisible[targetName] = true;

    this.apolloLastMovement[targetName] = now;

    this.apolloTargets[targetName] = {
      x: raw.x,
      y: raw.y,
    };

    /*
     * IMPORTANT:
     *
     * Once activated, the activation reference is
     * updated to the actual activation position.
     *
     * It will NOT matter while active because we accept
     * every update.
     *
     * When it eventually shuts off, this becomes the
     * baseline for the next activation.
     */
    this.apolloActivationReference[targetName] = {
      x: raw.x,
      y: raw.y,
    };

    this.emitApolloTargets();
  }

  // ==================================================
  // CONNECT
  // ==================================================

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (
        this.ws &&
        (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
      ) {
        resolve();
        return;
      }

      this.ws = new WebSocket(this.haUrl);

      this.ws.onopen = () => {
        console.log('Connected to Home Assistant');
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        // ==================================================
        // AUTH REQUIRED
        // ==================================================

        if (message.type === 'auth_required') {
          this.ws?.send(
            JSON.stringify({
              type: 'auth',
              access_token: this.token,
            }),
          );

          return;
        }

        // ==================================================
        // AUTH OK
        // ==================================================

        if (message.type === 'auth_ok') {
          console.log('Authenticated with Home Assistant');

          this.subscribeToStateChanges();

          this.requestCurrentStates();

          /*
           * Check every 100ms whether an active target
           * has been silent for 5 seconds.
           */
          setInterval(() => {
            this.checkApolloTargets();
          }, 100);

          resolve();

          return;
        }

        // ==================================================
        // AUTH FAILED
        // ==================================================

        if (message.type === 'auth_invalid') {
          console.error('Home Assistant authentication failed');

          reject(new Error('Home Assistant authentication failed'));

          return;
        }

        // ==================================================
        // RESULT
        // ==================================================

        if (message.type === 'result') {
          this.handleResult(message);
          return;
        }

        // ==================================================
        // EVENT
        // ==================================================

        if (message.type === 'event') {
          this.handleEvent(message);
        }
      };

      this.ws.onerror = (error) => {
        console.error('Home Assistant WebSocket error:', error);

        reject(error);
      };

      this.ws.onclose = () => {
        console.log('Disconnected from Home Assistant');

        this.ws = null;
      };
    });
  }

  // ==================================================
  // SUBSCRIBE
  // ==================================================

  private subscribeToStateChanges(): void {
    this.send({
      id: this.messageId++,
      type: 'subscribe_events',
      event_type: 'state_changed',
    });
  }

  // ==================================================
  // REQUEST CURRENT STATES
  // ==================================================

  private requestCurrentStates(): void {
    this.send({
      id: this.getStatesRequestId,
      type: 'get_states',
    });
  }

  // ==================================================
  // HANDLE RESULT
  // ==================================================

  private handleResult(message: any): void {
    if (!message.success) {
      console.error('HA command failed:', message);

      return;
    }

    if (message.id === this.getStatesRequestId) {
      const states = message.result;

      if (!Array.isArray(states)) {
        return;
      }

      /*
       * Load presence first.
       *
       * Then load coordinates.
       *
       * We intentionally do NOT call applyApolloPresence()
       * because presence itself should NOT create a dot.
       */

      for (const state of states) {
        if (!state?.entity_id) {
          continue;
        }

        this.states.set(state.entity_id, state);

        if (state.entity_id === this.apolloPresenceEntity) {
          const value = Number(state.state);

          this.apolloTargetCount = Number.isFinite(value) ? Math.max(0, value) : 0;
        }
      }

      for (const state of states) {
        if (!state?.entity_id) {
          continue;
        }

        if (this.apolloEntities.has(state.entity_id)) {
          this.processApolloState(state);
        }
      }
      this.lightsSubject.next(this.getLightEntities());

      console.log('HA LIGHTS LOADED:', this.getLightEntities());
    }
  }

  // ==================================================
  // HANDLE EVENT
  // ==================================================

  private handleEvent(message: any): void {
    if (message.event?.event_type !== 'state_changed') {
      return;
    }

    const state: HAState | null = message.event.data?.new_state;

    if (!state) {
      return;
    }

    this.states.set(state.entity_id, state);

    if (state.entity_id.startsWith('light.')) {
      this.lightsSubject.next(this.getLightEntities());
    }

    if (!this.apolloEntities.has(state.entity_id)) {
      return;
    }

    this.processApolloState(state);
  }

  // ==================================================
  // PROCESS APOLLO STATE
  // ==================================================

  private processApolloState(state: HAState): void {
    const entityId = state.entity_id;

    const value = Number(state.state);

    // ==================================================
    // PRESENCE
    // ==================================================

    if (entityId === this.apolloPresenceEntity) {
      this.apolloTargetCount = Number.isFinite(value) ? Math.max(0, value) : 0;

      console.log('APOLLO presence count:', this.apolloTargetCount);

      /*
       * IMPORTANT:
       *
       * Presence does NOT make the dot appear.
       *
       * We only use coordinate movement to activate
       * the target.
       *
       * We also do NOT immediately clear when presence
       * goes to zero because the user specifically wants
       * the last position held for 5 seconds.
       */

      return;
    }

    // ==================================================
    // INVALID VALUE
    // ==================================================

    if (!Number.isFinite(value)) {
      return;
    }

    // ==================================================
    // DETERMINE TARGET
    // ==================================================

    let targetName: TargetName | null = null;

    if (
      entityId === 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_x' ||
      entityId === 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_y'
    ) {
      targetName = 'target1';
    } else if (
      entityId === 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_x' ||
      entityId === 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_y'
    ) {
      targetName = 'target2';
    } else if (
      entityId === 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_x' ||
      entityId === 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_y'
    ) {
      targetName = 'target3';
    }

    if (!targetName) {
      return;
    }

    // ==================================================
    // UPDATE RAW POSITION
    // ==================================================

    const raw = this.apolloRawPositions[targetName];

    if (entityId.endsWith('_x')) {
      raw.x = value;
    }

    if (entityId.endsWith('_y')) {
      raw.y = value;
    }

    // ==================================================
    // PROCESS COMPLETE POSITION
    // ==================================================

    if (raw.x !== null && raw.y !== null) {
      this.processApolloPosition(targetName);
    }
  }

  // ==================================================
  // GET ENTITY STATE
  // ==================================================

  getState(entityId: string): HAState | undefined {
    return this.states.get(entityId);
  }

  getLightEntities(): HALight[] {
    const lights: HALight[] = [];

    for (const state of this.states.values()) {
      if (!state.entity_id.startsWith('light.')) {
        continue;
      }

      lights.push({
        entityId: state.entity_id,
        name: state.attributes?.['friendly_name'] ?? state.entity_id.replace('light.', ''),
        state: state.state as HALight['state'],
        attributes: state.attributes ?? {},
      });
    }

    return lights;
  }

  // ==================================================
  // SEND
  // ==================================================

  private send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('Home Assistant WebSocket is not connected');

      return;
    }

    this.ws.send(JSON.stringify(message));
  }
}
