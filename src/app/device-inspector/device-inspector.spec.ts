import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeviceInspector } from './device-inspector';

describe('DeviceInspector', () => {
  let component: DeviceInspector;
  let fixture: ComponentFixture<DeviceInspector>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeviceInspector],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceInspector);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
