import { CalendarEvent, CalendarEventData, eventDataToGCalEvent, extractCalDAVEventData, extractGCalEventData, GCalEvent, isCalDAVEvent, isGCalEvent } from './events';
import * as sync from './sync';
import * as fixtures from './testSupport/fixtures';

function mapEventToDataWithDescription(evt: CalendarEvent): CalendarEventData {
  const {eventData, srcId} = (() => {
    if (isGCalEvent(evt)) return { eventData: extractGCalEventData(evt), srcId: evt.id};
    if (isCalDAVEvent(evt)) return { eventData: extractCalDAVEventData(evt), srcId: evt.uid};
  })();
  eventData.description = `Original ID: ${srcId}`;
  return eventData;
}

function mapEventToTargetEvent(evt: CalendarEvent): GCalEvent {
  const {eventData, srcId} = (() => {
    if (isGCalEvent(evt)) return { eventData: extractGCalEventData(evt), srcId: evt.id};
    if (isCalDAVEvent(evt)) return { eventData: extractCalDAVEventData(evt), srcId: evt.uid};
    throw new Error('Unexpected evt type not recognized');
  })();

  const newEvt = eventDataToGCalEvent(eventData);
  newEvt.id = srcId;
  newEvt.description = `Original ID: ${srcId}`;
  return newEvt;
}

describe('ToGCal', () => {

  test('empty sources and target', () => {
    const sourcesEvents = [];
    const targetEvents = [];
    expect(
      sync.ToGCal(sourcesEvents, targetEvents)
    ).toStrictEqual({
      insert: [],
      update: [],
      delete: []
    });
  });

  test('empty target', () => {
    const sourcesEvents = [fixtures.GetGCal('common'), fixtures.GetCalDAV('allDay')];
    const targetEvents = [];
    expect(
      sync.ToGCal(sourcesEvents, targetEvents)
    ).toStrictEqual({
      insert: sourcesEvents.map(mapEventToDataWithDescription),
      update: [],
      delete: []
    });
  });

  test('empty sources and non-empty target', () => {
    const sourcesEvents = [];
    const targetEvents = [fixtures.GetGCal('common'), fixtures.GetCalDAV('nonTransparent')].map((e) => mapEventToTargetEvent(e));
    expect(
      sync.ToGCal(sourcesEvents, targetEvents)
    ).toStrictEqual({
      insert: [],
      update: [],
      delete: targetEvents.map((e) => e.id)
    });
  });

  test('target events are in sync with sources events', () => {
    const sourcesEvents = [fixtures.GetGCal('common'), fixtures.GetCalDAV('transparent')];
    const targetEvents = sourcesEvents.map((e) => mapEventToTargetEvent(e));

    expect(
      sync.ToGCal(sourcesEvents, targetEvents)
    ).toStrictEqual({
      insert: [],
      update: [],
      delete: []
    });
  });

  test('event updated in sources', () => {
    const updatedGCalEvent = fixtures.GetGCal('common');
    updatedGCalEvent.start.dateTime = '2020-12-28T13:00:00+01:00';
    updatedGCalEvent.end.dateTime = '2020-12-28T14:00:00+01:00';
    updatedGCalEvent.summary = 'Updated common event';
    const sourcesEvents = [updatedGCalEvent, fixtures.GetCalDAV('nonTransparent')];

    const targetUpdatedEvent = fixtures.GetGCal('common');
    targetUpdatedEvent.id = 'aaaa_20201228T100000Z';
    // Changing the matching target's event ID to ensure the update API call
    // is done using it's ID and not the one of the matching sources event.
    targetUpdatedEvent.description = `Original ID: ${updatedGCalEvent.id}`;
    // Adjusting the description so it correctly mentions the original event's ID.
    const targetEvents = [targetUpdatedEvent, mapEventToTargetEvent(fixtures.GetCalDAV('nonTransparent'))];

    const updateEvtData = mapEventToDataWithDescription(targetUpdatedEvent);
    updateEvtData.start.dateTime = updatedGCalEvent.start.dateTime;
    updateEvtData.end.dateTime = updatedGCalEvent.end.dateTime;
    updateEvtData.summary = updatedGCalEvent.summary;
    updateEvtData.description = targetUpdatedEvent.description; // keeping the updated event's ID in the description

    expect(
      sync.ToGCal(sourcesEvents, targetEvents)
    ).toStrictEqual({
      insert: [],
      update: [{eventId: targetUpdatedEvent.id, eventData: updateEvtData}],
      delete: []
    });
  });

  test('missing event in target', () => {
    const sourcesEvents = [fixtures.GetGCal('common'), fixtures.GetCalDAV('nonTransparent')];
    const targetEvents = [fixtures.GetCalDAV('nonTransparent')].map((e) => mapEventToTargetEvent(e));

    expect(
      sync.ToGCal(sourcesEvents, targetEvents)
    ).toStrictEqual({
      insert: [mapEventToDataWithDescription(fixtures.GetGCal('common'))],
      update: [],
      delete: []
    });
  });

  test('extraneous event in target', () => {
    const sourcesEvents = [fixtures.GetGCal('common'), fixtures.GetCalDAV('nonTransparent')];
    const targetEvents = [fixtures.GetGCal('common'), fixtures.GetCalDAV('nonTransparent'), fixtures.GetCalDAV('transparent')].map((e) => mapEventToTargetEvent(e));

    expect(
      sync.ToGCal(sourcesEvents, targetEvents)
    ).toStrictEqual({
      insert: [],
      update: [],
      delete: [fixtures.GetCalDAV('transparent').uid]
    });
  });

  test('multiple changes', () => {
    const srcEventThatWasUpdated = fixtures.GetGCal('common');
    srcEventThatWasUpdated.start.dateTime = '2020-12-28T13:00:00+01:00';
    srcEventThatWasUpdated.end.dateTime = '2020-12-28T14:00:00+01:00';
    const sourcesEvents = [srcEventThatWasUpdated, fixtures.GetCalDAV('nonTransparent'), fixtures.GetCalDAV('nonAllDay')];

    const targetEventToBeUpdated = fixtures.GetGCal('common');
    targetEventToBeUpdated.id = 'aabbccdd'; // changing so we confirm the update is done using this id
    targetEventToBeUpdated.description = `Original ID: ${srcEventThatWasUpdated.id}`; // to match with srcEvent...
    const targetEvents = [targetEventToBeUpdated].concat([fixtures.GetCalDAV('nonTransparent'), fixtures.GetCalDAV('allDay')].map(mapEventToTargetEvent));

    const updateEventData = mapEventToDataWithDescription(fixtures.GetGCal('common'));
    updateEventData.start.dateTime = '2020-12-28T13:00:00+01:00';
    updateEventData.end.dateTime = '2020-12-28T14:00:00+01:00';

    expect((() => {
      const results = sync.ToGCal(sourcesEvents, targetEvents);
      return results;
    })()).toStrictEqual({
      insert: [mapEventToDataWithDescription(fixtures.GetCalDAV('nonAllDay'))],
      update: [{eventId: targetEventToBeUpdated.id, eventData: updateEventData}],
      delete: [fixtures.GetCalDAV('allDay').uid]
    });
  });
});