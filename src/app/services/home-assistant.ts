import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
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

@Injectable({
  providedIn: 'root',
})
export class HomeAssistantService {
  private ws: WebSocket | null = null;
  private messageId = 1;

  private readonly haUrl = 'ws://192.168.0.236/api/websocket';

  // DO NOT commit this to Git.
  // Replace with a NEW token after revoking the exposed one.
  private readonly token =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiI4ZTZmZjIwMGQ0ZTg0NzNmYmFlZjhjNTg5NTBjZjEyZSIsImlhdCI6MTc4NzM1NDY3OCwiZXhwIjoyMTAyNzE0Njc4fQ.T6WaSThgNU365KiDP6VYZf0sJvzrRUYDyPrOiydyaRs';

  private states = new Map<string, HAState>();

  private apolloTargets: ApolloTargets = {
    target1: { x: null, y: null },
    target2: { x: null, y: null },
    target3: { x: null, y: null },
  };

  readonly apolloTargets$ = new BehaviorSubject<ApolloTargets>({
    target1: { x: null, y: null },
    target2: { x: null, y: null },
    target3: { x: null, y: null },
  });

  private readonly apolloEntities = new Set([
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_x',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_y',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_x',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_y',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_x',
    'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_y',
  ]);

  getApolloTargets(): ApolloTargets {
    return {
      target1: { ...this.apolloTargets.target1 },
      target2: { ...this.apolloTargets.target2 },
      target3: { ...this.apolloTargets.target3 },
    };
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.haUrl);

      this.ws.onopen = () => {
        console.log('Connected to Home Assistant');
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        if (message.type === 'auth_required') {
          this.ws?.send(
            JSON.stringify({
              type: 'auth',
              access_token: this.token,
            }),
          );

          return;
        }

        if (message.type === 'auth_ok') {
          console.log('Authenticated with Home Assistant');

          this.subscribeToStateChanges();

          resolve();
          return;
        }

        if (message.type === 'auth_invalid') {
          console.error('Home Assistant authentication failed');
          reject(new Error('Home Assistant authentication failed'));
          return;
        }

        if (message.type === 'result') {
          this.handleResult(message);
          return;
        }

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
      };
    });
  }

  private subscribeToStateChanges(): void {
    this.send({
      id: this.messageId++,
      type: 'subscribe_events',
      event_type: 'state_changed',
    });
  }

  private handleResult(message: any): void {
    if (!message.success) {
      console.error('HA command failed:', message);
    }
  }

  private handleEvent(message: any): void {
    if (message.event?.event_type !== 'state_changed') {
      return;
    }

    const state: HAState | null = message.event.data?.new_state;

    if (!state) {
      return;
    }

    // Keep latest state available.
    this.states.set(state.entity_id, state);

    // We only care about the six Apollo coordinate entities.
    if (!this.apolloEntities.has(state.entity_id)) {
      return;
    }

    const value = Number(state.state);

    if (!Number.isFinite(value)) {
      return;
    }

    switch (state.entity_id) {
      case 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_x':
        this.apolloTargets.target1.x = value;
        break;

      case 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_1_y':
        this.apolloTargets.target1.y = value;
        break;

      case 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_x':
        this.apolloTargets.target2.x = value;
        break;

      case 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_2_y':
        this.apolloTargets.target2.y = value;
        break;

      case 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_x':
        this.apolloTargets.target3.x = value;
        break;

      case 'sensor.apollo_r_pro_1_ede2ac_ld2450_target_3_y':
        this.apolloTargets.target3.y = value;
        break;

      default:
        return;
    }

    // Emit a new object so Angular/RxJS sees the update.
    this.apolloTargets$.next({
      target1: { ...this.apolloTargets.target1 },
      target2: { ...this.apolloTargets.target2 },
      target3: { ...this.apolloTargets.target3 },
    });
  }

  getState(entityId: string): HAState | undefined {
    return this.states.get(entityId);
  }

  private send(message: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('Home Assistant WebSocket is not connected');
      return;
    }

    this.ws.send(JSON.stringify(message));
  }
}
