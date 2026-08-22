import { TestBed } from '@angular/core/testing';

import { HomeAssistantService } from './home-assistant';

describe('HomeAssistant', () => {
  let service: HomeAssistantService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HomeAssistantService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
