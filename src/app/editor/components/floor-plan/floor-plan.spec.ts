import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FloorPlan } from './floor-plan';

describe('FloorPlan', () => {
  let component: FloorPlan;
  let fixture: ComponentFixture<FloorPlan>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FloorPlan],
    }).compileComponents();

    fixture = TestBed.createComponent(FloorPlan);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
