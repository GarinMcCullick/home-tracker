import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditorToolbar } from './editor-toolbar.js';

describe('EditorToolbar', () => {
  let component: EditorToolbar;
  let fixture: ComponentFixture<EditorToolbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorToolbar],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorToolbar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
