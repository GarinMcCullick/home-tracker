import { Component, EventEmitter, Input, Output } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SmartDevice, SmartDeviceType } from '../models/smart-device';

import { HALight, HomeAssistantService } from '../services/home-assistant';

@Component({
  selector: 'app-device-inspector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './device-inspector.html',
  styleUrl: './device-inspector.scss',
})
export class DeviceInspector {
  @Input() device: SmartDevice | undefined;

  @Input() light: HALight | undefined;

  @Input() initialPosition?: {
    x: number;
    y: number;
  };

  @Output() close = new EventEmitter<void>();

  private lastInitialPosition: { x: number; y: number } | undefined;
  // -----------------------------------------
  // PANEL POSITION
  // -----------------------------------------
  ngOnChanges() {
    if (!this.initialPosition) {
      return;
    }

    // Only reposition when the initial position actually changes.
    if (
      this.lastInitialPosition?.x === this.initialPosition.x &&
      this.lastInitialPosition?.y === this.initialPosition.y
    ) {
      return;
    }

    this.position = {
      ...this.initialPosition,
    };

    this.lastInitialPosition = {
      ...this.initialPosition,
    };
  }

  position = {
    x: 0,
    y: 0,
  };

  dragging = false;

  private dragOffset = {
    x: 0,
    y: 0,
  };

  constructor(public homeAssistantService: HomeAssistantService) {}

  // -----------------------------------------
  // DEVICE TYPE
  // -----------------------------------------

  get deviceType(): SmartDeviceType | null {
    return this.device?.type ?? null;
  }

  // -----------------------------------------
  // DRAG PANEL
  // -----------------------------------------

  startDragging(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    // Don't let the editor interpret this as a workspace drag.
    this.dragging = true;

    this.dragOffset = {
      x: event.clientX - this.position.x,
      y: event.clientY - this.position.y,
    };

    window.addEventListener('mousemove', this.onDrag);
    window.addEventListener('mouseup', this.stopDragging);
  }

  private onDrag = (event: MouseEvent) => {
    if (!this.dragging) {
      return;
    }

    this.position = {
      x: event.clientX - this.dragOffset.x,
      y: event.clientY - this.dragOffset.y,
    };
  };

  private stopDragging = () => {
    this.dragging = false;

    window.removeEventListener('mousemove', this.onDrag);

    window.removeEventListener('mouseup', this.stopDragging);
  };

  // -----------------------------------------
  // CLOSE
  // -----------------------------------------

  closeInspector() {
    this.close.emit();
  }

  // -----------------------------------------
  // LIGHT
  // -----------------------------------------

  toggleLight() {
    if (!this.device?.entityId) {
      return;
    }

    this.homeAssistantService.toggle(this.device.entityId);
  }

  setBrightness(event: Event) {
    if (!this.device?.entityId) {
      return;
    }

    const input = event.target as HTMLInputElement;

    this.homeAssistantService.setLightBrightness(this.device.entityId, Number(input.value));
  }

  get brightness(): number {
    return Number(this.light?.attributes?.['brightness'] ?? 255);
  }

  // -----------------------------------------
  // HELPERS
  // -----------------------------------------

  isLight(): boolean {
    return this.device?.type === 'light';
  }

  isSwitch(): boolean {
    return this.device?.type === 'switch';
  }

  isThermostat(): boolean {
    return this.device?.type === 'thermostat';
  }

  isCamera(): boolean {
    return this.device?.type === 'camera';
  }

  isMmWave(): boolean {
    return this.device?.type === 'mmwave';
  }

  isMotion(): boolean {
    return this.device?.type === 'motion';
  }

  isSpeaker(): boolean {
    return this.device?.type === 'speaker';
  }
}
