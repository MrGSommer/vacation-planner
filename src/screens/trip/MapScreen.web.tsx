import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Header, LoadingScreen, Button, Input, TimePickerInput, PlaceAutocomplete, CategoryFieldsInput } from '../../components/common';
import { PlaceResult, importMapsLibrary } from '../../components/common/PlaceAutocomplete';
import { getStopLocations, StopLocation } from '../../api/stops';
import { getActivitiesForTrip, getDays, createActivity } from '../../api/itineraries';
import { getTrip } from '../../api/trips';
import { Trip, Activity, ItineraryDay } from '../../types/database';
import { RootStackParamList } from '../../types/navigation';
import { ACTIVITY_CATEGORIES, getActivityIcon } from '../../utils/constants';
import { CATEGORY_COLORS, formatCategoryDetail } from '../../utils/categoryFields';
import { formatDateShort } from '../../utils/dateHelpers';
import { colors, spacing, borderRadius, typography, shadows } from '../../utils/theme';
import { usePresence } from '../../hooks/usePresence';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { MapPOICard, POIDetails, detectCategory } from '../../components/map/MapPOICard';
import { MapNearbySearch } from '../../components/map/MapNearbySearch';
import { MapsAppPicker, tryOpenMapsDirectly } from '../../components/map/MapsAppPicker';
import { OfflineMapView } from '../../components/map/OfflineMapView';
import { prefetchTripMapTiles, computeBoundingBox } from '../../utils/mapTileCache';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

const getCategoryIcon = (cat: string, catData?: Record<string, any> | null) => getActivityIcon(cat, catData);

interface DayInfo { date: string; dayNumber: number; }

interface PreviewPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  isCustomPin: boolean;
}

function getTransportPolylineOptions(transportType: string): google.maps.PolylineOptions {
  switch (transportType) {
    case 'Flug':
      return { strokeColor: '#4A90D9', strokeWeight: 3, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3, strokeColor: '#4A90D9' }, offset: '0', repeat: '15px' }] };
    case 'Zug':
      return { strokeColor: '#27AE60', strokeWeight: 3, strokeOpacity: 0.8 };
    case 'Bus':
      return { strokeColor: '#E67E22', strokeWeight: 2, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, scale: 2, strokeColor: '#E67E22' }, offset: '0', repeat: '10px' }] };
    case 'Fähre':
      return { strokeColor: '#4ECDC4', strokeWeight: 3, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3, strokeColor: '#4ECDC4' }, offset: '0', repeat: '15px' }] };
    case 'Taxi':
      return { strokeColor: '#F1C40F', strokeWeight: 2, strokeOpacity: 0.7 };
    default: // Auto, etc.
      return { strokeColor: '#636E72', strokeWeight: 2, strokeOpacity: 0.6 };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildInfoContent(act: Activity, dayInfo?: DayInfo): string {
  const icon = getCategoryIcon(act.category, act.category_data);
  const catData = act.category_data || {};
  const detail = formatCategoryDetail(act.category, catData);
  let html = `<div style="font-family:sans-serif;min-width:180px"><strong>${icon} ${escapeHtml(act.title)}</strong>`;
  if (dayInfo) html += `<br/><span style="color:${colors.primary};font-size:12px;font-weight:600">Tag ${dayInfo.dayNumber} · ${formatDateShort(dayInfo.date)}</span>`;
  if (act.location_name) html += `<br/><small>📍 ${escapeHtml(act.location_name)}</small>`;
  if (detail) html += `<br/><span style="color:${CATEGORY_COLORS[act.category] || '#666'};font-size:13px">${escapeHtml(detail)}</span>`;
  if (act.description) html += `<br/><small style="color:#636E72">${escapeHtml(act.description)}</small>`;
  html += '</div>';
  return html;
}

export const MapScreen: React.FC<Props> = ({ navigation, route }) => {
  const { tripId } = route.params;
  usePresence(tripId, 'Karte');
  const isOnline = useNetworkStatus();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const mapMarkersRef = useRef<any[]>([]);
  const mapPolylinesRef = useRef<any[]>([]);
  const mapInfoWindowsRef = useRef<google.maps.InfoWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<Trip | null>(null);
  const [days, setDays] = useState<ItineraryDay[]>([]);

  // Data for offline view
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stops, setStops] = useState<StopLocation[]>([]);

  // FAB modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string>('');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('activity');
  const [newStartTime, setNewStartTime] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newLocationLat, setNewLocationLat] = useState<number | null>(null);
  const [newLocationLng, setNewLocationLng] = useState<number | null>(null);
  const [newLocationAddress, setNewLocationAddress] = useState<string | null>(null);
  const [newNotes, setNewNotes] = useState('');
  const [newCategoryData, setNewCategoryData] = useState<Record<string, any>>({});

  // Preview / search state
  const [previewPlace, setPreviewPlace] = useState<PreviewPlace | null>(null);
  const [customPinName, setCustomPinName] = useState('');
  const previewMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const markerLibRef = useRef<any>(null);

  // POI Card state
  const [poiDetails, setPoiDetails] = useState<POIDetails | null>(null);
  const [showMapsPicker, setShowMapsPicker] = useState(false);

  // Nearby Search state
  const [nearbyChipId, setNearbyChipId] = useState<string | null>(null);
  const [nearbyMarkers, setNearbyMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [nearbyResultCount, setNearbyResultCount] = useState(0);

  const clearNearbyMarkers = useCallback(() => {
    nearbyMarkers.forEach(m => { m.map = null; });
    setNearbyMarkers([]);
    setNearbyResultCount(0);
    setNearbyChipId(null);
  }, [nearbyMarkers]);

  // ─── POI Click Handler ───
  const handlePoiClick = useCallback(async (placeId: string) => {
    try {
      const placesLib = await importMapsLibrary('places');
      const PlaceClass = placesLib.Place || google.maps.places?.Place;
      if (!PlaceClass) return;

      const place = new PlaceClass({ id: placeId });
      await place.fetchFields({
        fields: [
          'displayName', 'formattedAddress', 'location',
          'rating', 'userRatingCount',
          'regularOpeningHours', 'photos', 'websiteURI', 'types',
        ],
      });

      const loc = place.location;
      if (!loc) return;

      let photoUrl: string | undefined;
      if (place.photos?.length > 0) {
        try {
          const photo = place.photos[0];
          photoUrl = photo.getURI({ maxWidth: 400, maxHeight: 200 });
        } catch {}
      }

      const poi: POIDetails = {
        name: place.displayName || '',
        address: place.formattedAddress || '',
        lat: loc.lat(),
        lng: loc.lng(),
        rating: place.rating ?? undefined,
        userRatingCount: place.userRatingCount ?? undefined,
        isOpen: place.regularOpeningHours?.periods
          ? isCurrentlyOpen(place.regularOpeningHours)
          : undefined,
        openingHoursText: place.regularOpeningHours?.weekdayDescriptions,
        photoUrl,
        websiteUrl: place.websiteURI || undefined,
        types: place.types || undefined,
        placeId,
      };
      setPoiDetails(poi);
      setPreviewPlace(null); // Close any custom pin preview

      // Pan to POI
      const map = googleMapRef.current;
      if (map) map.panTo({ lat: poi.lat, lng: poi.lng });
    } catch (err) {
      console.error('POI details error:', err);
    }
  }, []);

  // ─── Nearby Search ───
  const handleNearbySearch = useCallback(async (types: string[], chipId: string) => {
    const map = googleMapRef.current;
    const lib = markerLibRef.current;
    if (!map || !lib) return;

    // Clear previous markers
    nearbyMarkers.forEach(m => { m.map = null; });

    try {
      const placesLib = await importMapsLibrary('places');
      const bounds = map.getBounds();
      if (!bounds) return;

      const center = map.getCenter();
      if (!center) return;

      // Calculate radius from visible bounds (approximate)
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const latDiff = Math.abs(ne.lat() - sw.lat());
      const lngDiff = Math.abs(ne.lng() - sw.lng());
      const maxDiff = Math.max(latDiff, lngDiff);
      // Rough: 1 degree ≈ 111km
      const radiusMeters = Math.min(Math.round(maxDiff * 111000 / 2), 50000);

      const request = {
        includedTypes: types,
        locationRestriction: {
          center: { lat: center.lat(), lng: center.lng() },
          radius: radiusMeters,
        },
        maxResultCount: 20,
        fields: ['displayName', 'location', 'rating', 'types', 'formattedAddress'],
      };

      const PlaceClass = placesLib.Place || google.maps.places?.Place;
      if (!PlaceClass?.searchNearby) return;

      const { places } = await PlaceClass.searchNearby(request);
      if (!places?.length) {
        setNearbyMarkers([]);
        setNearbyResultCount(0);
        setNearbyChipId(chipId);
        return;
      }

      const { AdvancedMarkerElement, PinElement } = lib;
      const markers: google.maps.marker.AdvancedMarkerElement[] = [];

      places.forEach((place: any) => {
        const loc = place.location;
        if (!loc) return;
        const pin = new PinElement({
          background: colors.secondary,
          borderColor: colors.card,
          scale: 0.9,
          glyphColor: '#FFFFFF',
        });
        const marker = new AdvancedMarkerElement({
          position: { lat: loc.lat(), lng: loc.lng() },
          map,
          title: place.displayName || '',
          content: pin.element,
          gmpClickable: true,
        });
        marker.addEventListener('gmp-click', () => {
          // Show POI card for this nearby result
          const placeId = place.id || place.place_id;
          if (placeId) handlePoiClick(placeId);
        });
        markers.push(marker);
      });

      setNearbyMarkers(markers);
      setNearbyResultCount(markers.length);
      setNearbyChipId(chipId);
    } catch (err) {
      console.error('Nearby search error:', err);
    }
  }, [nearbyMarkers, handlePoiClick]);

  const initMap = useCallback(async () => {
    // Cleanup previous markers, polylines, info windows to prevent memory leaks
    mapMarkersRef.current.forEach(m => { try { m.map = null; } catch {} });
    mapMarkersRef.current = [];
    mapPolylinesRef.current.forEach(p => { try { p.setMap(null); } catch {} });
    mapPolylinesRef.current = [];
    mapInfoWindowsRef.current.forEach(iw => { try { iw.close(); } catch {} });
    mapInfoWindowsRef.current = [];

    try {
      const [t, s, a, fetchedDays] = await Promise.all([
        getTrip(tripId),
        getStopLocations(tripId),
        getActivitiesForTrip(tripId),
        getDays(tripId),
      ]);

      setTripData(t);
      setStops(s);
      setActivities(a);
      setDays(fetchedDays);
      if (fetchedDays.length > 0 && !selectedDayId) {
        setSelectedDayId(fetchedDays[0].id);
      }

      // Pre-fetch Mapbox tiles for offline (background, non-blocking)
      const allPoints = [
        ...s.map(stop => ({ lat: stop.lat, lng: stop.lng })),
        ...a.filter(act => act.location_lat && act.location_lng).map(act => ({ lat: act.location_lat!, lng: act.location_lng! })),
      ];
      if (allPoints.length > 0) {
        const bbox = computeBoundingBox(allPoints);
        prefetchTripMapTiles(bbox).catch(() => {});
      }

      // Build dayId → dayInfo map
      const sortedDays = [...fetchedDays].sort((a, b) => a.date.localeCompare(b.date));
      const dayInfoMap: Record<string, DayInfo> = {};
      sortedDays.forEach((d, i) => { dayInfoMap[d.id] = { date: d.date, dayNumber: i + 1 }; });

      const mapsLib = await importMapsLibrary('maps');
      const markerLib = await importMapsLibrary('marker');
      await importMapsLibrary('core');
      if (!mapRef.current) return;

      const center = s.length > 0
        ? { lat: s[0].lat, lng: s[0].lng }
        : t.destination_lat && t.destination_lng
          ? { lat: t.destination_lat, lng: t.destination_lng }
          : { lat: 47.37, lng: 8.54 };

      const MapClass = mapsLib.Map || google.maps.Map;
      const map = new MapClass(mapRef.current, {
        center,
        zoom: 8,
        mapTypeControl: false,
        streetViewControl: false,
        mapId: '5617c0f0247bb2e3f910e4fd',
      });
      googleMapRef.current = map;

      // Click handler: POI click (placeId) vs empty area (custom pin)
      map.addListener('click', (e: any) => {
        if (e.placeId) {
          e.stop();
          handlePoiClick(e.placeId);
        } else if (e.latLng) {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          addPreviewMarker(lat, lng);
          setPoiDetails(null);
          setCustomPinName('');
          reverseGeocode(lat, lng).then(address => {
            setPreviewPlace({ name: '', address, lat, lng, isCustomPin: true });
          });
        }
      });

      const { AdvancedMarkerElement, PinElement } = markerLib;
      markerLibRef.current = markerLib;

      // Load geocoding for reverse geocode on click
      await importMapsLibrary('geocoding');
      geocoderRef.current = new google.maps.Geocoder();

      const bounds = new google.maps.LatLngBounds();
      let openInfoWindow: google.maps.InfoWindow | null = null;

      const openInfo = (infoWindow: google.maps.InfoWindow, anchor: any) => {
        if (openInfoWindow) openInfoWindow.close();
        infoWindow.open({ map, anchor });
        openInfoWindow = infoWindow;
      };

      // Stop markers
      s.forEach((stop: StopLocation, i: number) => {
        const pos = { lat: stop.lat, lng: stop.lng };
        bounds.extend(pos);
        const pin = new PinElement({
          background: stop.type === 'overnight' ? colors.primary : colors.secondary,
          borderColor: '#FFFFFF',
          glyph: `${i + 1}`,
          glyphColor: '#FFFFFF',
        });
        const marker = new AdvancedMarkerElement({
          position: pos, map, title: stop.name,
          content: pin.element,
          gmpClickable: true,
        });
        mapMarkersRef.current.push(marker);
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif"><strong>${stop.name}</strong><br/>${stop.type === 'overnight' ? `🏠 ${stop.arrival_date && stop.departure_date ? `${stop.arrival_date} – ${stop.departure_date} (${stop.nights} N.)` : `${stop.nights} Nacht/Nächte`}` : '📍 Zwischenstopp'}<br/><small>${stop.address || ''}</small></div>`,
        });
        mapInfoWindowsRef.current.push(infoWindow);
        marker.addEventListener('gmp-click', () => openInfo(infoWindow, marker));
      });

      // Activity markers
      a.filter((act: Activity) => act.location_lat && act.location_lng).forEach((act: Activity) => {
        const pos = { lat: act.location_lat!, lng: act.location_lng! };
        bounds.extend(pos);
        const catColor = CATEGORY_COLORS[act.category] || colors.accent;
        const glyphEl = document.createElement('span');
        glyphEl.textContent = getCategoryIcon(act.category, act.category_data);
        glyphEl.style.fontSize = '14px';
        const pin = new PinElement({
          background: catColor,
          borderColor: '#FFFFFF',
          glyph: glyphEl,
        });
        const marker = new AdvancedMarkerElement({
          position: pos, map, title: act.title,
          content: pin.element,
          gmpClickable: true,
        });
        mapMarkersRef.current.push(marker);
        const infoWindow = new google.maps.InfoWindow({ content: buildInfoContent(act, dayInfoMap[act.day_id]) });
        mapInfoWindowsRef.current.push(infoWindow);
        marker.addEventListener('gmp-click', () => openInfo(infoWindow, marker));
      });

      // Transport routes
      a.filter((act: Activity) => act.category === 'transport').forEach((act: Activity) => {
        const catData = act.category_data || {};
        const transportType = catData.transport_type || 'Auto';
        const depLat = catData.departure_station_lat;
        const depLng = catData.departure_station_lng;
        const arrLat = catData.arrival_station_lat;
        const arrLng = catData.arrival_station_lng;

        if (depLat && depLng && arrLat && arrLng) {
          const depPos = { lat: depLat, lng: depLng };
          const arrPos = { lat: arrLat, lng: arrLng };
          bounds.extend(depPos);
          bounds.extend(arrPos);

          const depGlyph = document.createElement('span');
          depGlyph.textContent = '🛫';
          depGlyph.style.fontSize = '14px';
          const depPin = new PinElement({
            background: CATEGORY_COLORS.transport, borderColor: '#FFFFFF', glyph: depGlyph,
          });
          const depMarker = new AdvancedMarkerElement({
            position: depPos, map, title: catData.departure_station_name || 'Abfahrt',
            content: depPin.element,
            gmpClickable: true,
          });
          mapMarkersRef.current.push(depMarker);
          const depInfo = new google.maps.InfoWindow({ content: buildInfoContent(act, dayInfoMap[act.day_id]) });
          mapInfoWindowsRef.current.push(depInfo);
          depMarker.addEventListener('gmp-click', () => openInfo(depInfo, depMarker));

          const arrGlyph = document.createElement('span');
          arrGlyph.textContent = '🛬';
          arrGlyph.style.fontSize = '14px';
          const arrPin = new PinElement({
            background: CATEGORY_COLORS.transport, borderColor: '#FFFFFF', glyph: arrGlyph,
          });
          const arrMarker = new AdvancedMarkerElement({
            position: arrPos, map, title: catData.arrival_station_name || 'Ankunft',
            content: arrPin.element,
            gmpClickable: true,
          });
          mapMarkersRef.current.push(arrMarker);
          const arrInfo = new google.maps.InfoWindow({ content: buildInfoContent(act, dayInfoMap[act.day_id]) });
          mapInfoWindowsRef.current.push(arrInfo);
          arrMarker.addEventListener('gmp-click', () => openInfo(arrInfo, arrMarker));

          // Build polyline path (dep → arr)
          const path: { lat: number; lng: number }[] = [depPos, arrPos];

          const polyOpts = getTransportPolylineOptions(transportType);
          const polyline = new google.maps.Polyline({
            path,
            map,
            ...polyOpts,
          });
          mapPolylinesRef.current.push(polyline);
        }
      });

      // Route via Routes API (with round trip support)
      if (s.length >= 2) {
        try {
          const isRound = t.is_round_trip;
          const routesLib = await importMapsLibrary('routes');
          const RouteClass = routesLib.Route;

          const origin = { lat: s[0].lat, lng: s[0].lng };
          const destination = isRound
            ? origin
            : { lat: s[s.length - 1].lat, lng: s[s.length - 1].lng };
          const intermediates = isRound
            ? s.slice(1).map((st: StopLocation) => ({ lat: st.lat, lng: st.lng }))
            : s.slice(1, -1).map((st: StopLocation) => ({ lat: st.lat, lng: st.lng }));

          const { routes: computedRoutes } = await RouteClass.computeRoutes({
            origin,
            destination,
            intermediates,
            travelMode: 'DRIVING',
            fields: ['path'],
          });

          if (computedRoutes?.[0]) {
            const polylines = computedRoutes[0].createPolylines();
            polylines.forEach((pl: any) => {
              pl.setOptions({
                strokeColor: colors.primary,
                strokeWeight: 4,
                strokeOpacity: 0.7,
              });
              pl.setMap(map);
              mapPolylinesRef.current.push(pl);
            });
          }
        } catch (routeErr) {
          console.warn('Routes API error, falling back to polyline:', routeErr);
          const path = s.map((st: StopLocation) => ({ lat: st.lat, lng: st.lng }));
          if (t.is_round_trip) path.push({ lat: s[0].lat, lng: s[0].lng });
          const fallbackPl = new google.maps.Polyline({
            map,
            path,
            strokeColor: colors.primary,
            strokeWeight: 3,
            strokeOpacity: 0.6,
          });
          mapPolylinesRef.current.push(fallbackPl);
        }
      }

      const hasPoints = s.length > 0 || a.some((act: Activity) => act.location_lat);
      if (hasPoints) map.fitBounds(bounds, 60);
    } catch (e) {
      console.error('Map init error:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId, handlePoiClick]);

  useEffect(() => { initMap(); }, [initMap]);

  const handleAddActivity = async () => {
    if (!newTitle.trim() || !selectedDayId) return;
    try {
      await createActivity({
        day_id: selectedDayId,
        trip_id: tripId,
        title: newTitle.trim(),
        description: newNotes.trim() || null,
        category: newCategory,
        start_time: newStartTime || null,
        end_time: null,
        location_name: newLocation.trim() || null,
        location_lat: newLocationLat,
        location_lng: newLocationLng,
        location_address: newLocationAddress,
        cost: null,
        currency: 'CHF',
        sort_order: 0,
        check_in_date: newCategoryData.check_in_date || null,
        check_out_date: newCategoryData.check_out_date || null,
        category_data: newCategoryData,
      });
      setShowModal(false);
      resetForm();
      // Reinitialize map to show new marker
      setLoading(true);
      await initMap();
    } catch (e) {
      Alert.alert('Fehler', 'Aktivität konnte nicht erstellt werden');
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setNewNotes('');
    setNewLocation('');
    setNewLocationLat(null);
    setNewLocationLng(null);
    setNewLocationAddress(null);
    setNewStartTime('');
    setNewCategory('activity');
    setNewCategoryData({});
  };

  const clearPreviewMarker = () => {
    if (previewMarkerRef.current) {
      previewMarkerRef.current.map = null;
      previewMarkerRef.current = null;
    }
  };

  const dismissPreview = () => {
    clearPreviewMarker();
    setPreviewPlace(null);
    setCustomPinName('');
  };

  const dismissPoiCard = () => {
    setPoiDetails(null);
  };

  const addPreviewMarker = (lat: number, lng: number) => {
    clearPreviewMarker();
    const map = googleMapRef.current;
    const lib = markerLibRef.current;
    if (!map || !lib) return;
    const { AdvancedMarkerElement, PinElement } = lib;
    const pin = new PinElement({
      background: colors.accent,
      borderColor: '#FFFFFF',
      scale: 1.3,
      glyphColor: '#FFFFFF',
    });
    // Add a glow shadow to the pin element
    pin.element.style.filter = `drop-shadow(0 0 6px ${colors.accent}80)`;
    const marker = new AdvancedMarkerElement({
      position: { lat, lng },
      map,
      content: pin.element,
    });
    previewMarkerRef.current = marker;
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      if (!geocoderRef.current) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      const resp = await geocoderRef.current.geocode({ location: { lat, lng } });
      if (resp.results?.[0]?.formatted_address) return resp.results[0].formatted_address;
    } catch { /* ignore */ }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  };


  const handleSearchSelect = (place: PlaceResult) => {
    const map = googleMapRef.current;
    if (!map) return;
    map.panTo({ lat: place.lat, lng: place.lng });
    map.setZoom(16);

    // If the place has a place_id, show POI card with full details
    if (place.place_id) {
      handlePoiClick(place.place_id);
    } else {
      addPreviewMarker(place.lat, place.lng);
      setPreviewPlace({
        name: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        isCustomPin: false,
      });
    }
  };

  const openAddActivityFromPreview = () => {
    if (!previewPlace) return;
    const name = previewPlace.isCustomPin ? customPinName.trim() : previewPlace.name;
    setNewLocation(name || previewPlace.address);
    setNewLocationLat(previewPlace.lat);
    setNewLocationLng(previewPlace.lng);
    setNewLocationAddress(previewPlace.address);
    if (name) setNewTitle(name);
    dismissPreview();
    setShowModal(true);
  };

  const openAddActivityFromPOI = () => {
    if (!poiDetails) return;
    const cat = detectCategory(poiDetails.types);
    setNewLocation(poiDetails.name || poiDetails.address);
    setNewLocationLat(poiDetails.lat);
    setNewLocationLng(poiDetails.lng);
    setNewLocationAddress(poiDetails.address);
    setNewTitle(poiDetails.name);
    setNewCategory(cat);
    dismissPoiCard();
    setShowModal(true);
  };

  const handlePoiRoutePlanner = () => {
    if (!poiDetails) return;
    const opened = tryOpenMapsDirectly(
      poiDetails.lat, poiDetails.lng,
      poiDetails.name, poiDetails.address,
    );
    if (!opened) setShowMapsPicker(true);
  };

  // ─── Offline fallback ───
  if (!isOnline && !loading) {
    return (
      <View style={styles.container}>
        <Header title="Karte" onBack={() => navigation.goBack()} />
        <OfflineMapView tripId={tripId} activities={activities} stops={stops} isRoundTrip={tripData?.is_round_trip} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Karte" onBack={() => navigation.goBack()} />
      {loading && <LoadingScreen />}
      <div ref={mapRef} style={{ flex: 1, width: '100%', height: '100%', display: loading ? 'none' : 'block' }} />

      {/* Search bar overlay */}
      {!loading && (
        <div style={{
          position: 'absolute', top: 72, left: spacing.md, right: spacing.md,
          zIndex: 1000,
        }}>
          <PlaceAutocomplete
            placeholder="Ort suchen..."
            onSelect={handleSearchSelect}
            onChangeText={() => {}}
          />
        </div>
      )}

      {/* Nearby Search chips */}
      {!loading && !poiDetails && !previewPlace && (
        <MapNearbySearch
          onSearch={handleNearbySearch}
          onClear={clearNearbyMarkers}
          activeChipId={nearbyChipId}
          resultCount={nearbyResultCount}
        />
      )}

      {/* POI Detail Card (from POI click or nearby search result) */}
      {poiDetails && !showModal && (
        <MapPOICard
          poi={poiDetails}
          onAddActivity={openAddActivityFromPOI}
          onRoutePlanner={handlePoiRoutePlanner}
          onClose={dismissPoiCard}
        />
      )}

      {/* Preview card (custom pin / search without placeId) */}
      {previewPlace && !showModal && !poiDetails && (
        <View style={styles.previewCard}>
          <TouchableOpacity style={styles.previewClose} onPress={dismissPreview}>
            <Text style={styles.previewCloseText}>✕</Text>
          </TouchableOpacity>
          {previewPlace.isCustomPin ? (
            <TextInput
              style={styles.previewNameInput}
              value={customPinName}
              onChangeText={setCustomPinName}
              placeholder="Name eingeben..."
              placeholderTextColor={colors.textLight}
            />
          ) : (
            <Text style={styles.previewName} numberOfLines={1}>{previewPlace.name}</Text>
          )}
          <Text style={styles.previewAddress} numberOfLines={2}>{previewPlace.address}</Text>
          <Text style={styles.previewCoords}>
            {previewPlace.lat.toFixed(4)}° N, {previewPlace.lng.toFixed(4)}° E
          </Text>
          <Button
            title="Aktivität hinzufügen"
            onPress={openAddActivityFromPreview}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}

      {/* FAB */}
      {!loading && (
        <TouchableOpacity
          style={[styles.fab, (previewPlace || poiDetails) && { bottom: 200 }]}
          onPress={() => setShowModal(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add Activity Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Aktivität hinzufügen</Text>
            <ScrollView>
              {/* Day Picker */}
              <Text style={styles.fieldLabel}>Tag</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {days.map(day => (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.catChip, selectedDayId === day.id && styles.catChipActive]}
                    onPress={() => setSelectedDayId(day.id)}
                  >
                    <Text style={[styles.catLabel, selectedDayId === day.id && styles.catLabelActive]}>
                      {formatDateShort(day.date)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Input label="Titel" placeholder="z.B. Stadtführung" value={newTitle} onChangeText={setNewTitle} />

              <Text style={styles.fieldLabel}>Kategorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                {ACTIVITY_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, newCategory === cat.id && styles.catChipActive]}
                    onPress={() => { setNewCategory(cat.id); setNewCategoryData({}); }}
                  >
                    <Text style={styles.catIcon}>{cat.icon}</Text>
                    <Text style={[styles.catLabel, newCategory === cat.id && styles.catLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TimePickerInput label="Uhrzeit" value={newStartTime} onChange={setNewStartTime} placeholder="z.B. 09:00" />

              <CategoryFieldsInput category={newCategory} data={newCategoryData} onChange={setNewCategoryData} />

              <PlaceAutocomplete
                label="Ort"
                placeholder="z.B. Sagrada Familia"
                value={newLocation}
                onChangeText={setNewLocation}
                onSelect={(place: PlaceResult) => {
                  setNewLocation(place.name);
                  setNewLocationLat(place.lat);
                  setNewLocationLng(place.lng);
                  setNewLocationAddress(place.address);
                }}
              />

              <Input label="Notizen" placeholder="Optionale Notizen..." value={newNotes} onChangeText={setNewNotes} multiline numberOfLines={3} style={{ height: 80, textAlignVertical: 'top' }} />
            </ScrollView>

            <View style={styles.modalButtons}>
              <Button title="Abbrechen" onPress={() => { setShowModal(false); resetForm(); }} variant="ghost" style={styles.modalBtn} />
              <Button title="Hinzufügen" onPress={handleAddActivity} disabled={!newTitle.trim() || !selectedDayId} style={styles.modalBtn} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Maps App Picker (for POI route planning) */}
      {poiDetails && (
        <MapsAppPicker
          visible={showMapsPicker}
          lat={poiDetails.lat}
          lng={poiDetails.lng}
          label={poiDetails.name}
          locationContext={poiDetails.address}
          onClose={() => setShowMapsPicker(false)}
        />
      )}

    </View>
  );
};

/** Check if a place is currently open based on regularOpeningHours */
function isCurrentlyOpen(hours: any): boolean {
  try {
    if (typeof hours.isOpen === 'function') return hours.isOpen();
    // Fallback: check periods manually
    const now = new Date();
    const day = now.getDay(); // 0=Sunday
    const time = now.getHours() * 100 + now.getMinutes();
    const periods = hours.periods || [];
    for (const period of periods) {
      const openDay = period.open?.day;
      const openTime = (period.open?.hours || 0) * 100 + (period.open?.minutes || 0);
      const closeDay = period.close?.day;
      const closeTime = period.close
        ? (period.close.hours || 0) * 100 + (period.close.minutes || 0)
        : 2400;

      if (openDay === day) {
        // Same-day closing or 24h open (closeTime=2400)
        if (closeDay === day || closeDay === undefined) {
          if (time >= openTime && time < closeTime) return true;
        }
        // Overnight: closes next day — open from openTime until midnight
        if (closeDay !== undefined && closeDay !== day) {
          if (time >= openTime) return true;
        }
      }
      // Check if we're in the overnight carry-over (after midnight, before close)
      if (closeDay === day && openDay !== day) {
        if (time < closeTime) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  fab: {
    position: 'absolute',
    bottom: spacing.xl + 8,
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  fabText: { color: '#FFFFFF', fontSize: 28, lineHeight: 30, fontWeight: '300' },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.card, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '80%' },
  modalTitle: { ...typography.h2, marginBottom: spacing.lg },
  fieldLabel: { ...typography.bodySmall, fontWeight: '600', marginBottom: spacing.sm },
  categoryRow: { marginBottom: spacing.md },
  catChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  catIcon: { fontSize: 16, marginRight: 4 },
  catLabel: { ...typography.caption },
  catLabelActive: { color: colors.primary, fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalBtn: { flex: 1 },
  // Preview card
  previewCard: {
    position: 'absolute',
    bottom: spacing.xl + 8,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.lg,
    zIndex: 500,
  },
  previewClose: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  previewCloseText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  previewName: {
    ...typography.h3,
    paddingRight: 32,
  },
  previewNameInput: {
    ...typography.h3,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    paddingBottom: spacing.xs,
    paddingRight: 32,
    outlineStyle: 'none' as any,
  },
  previewAddress: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  previewCoords: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: 2,
  },
});
