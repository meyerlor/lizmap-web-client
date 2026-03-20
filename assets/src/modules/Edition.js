/**
 * @module modules/Edition.js
 * @name Edition
 * @copyright 2023 3Liz
 * @author DHONT René-Luc
 * @license MPL-2.0
 */

import { mainLizmap, mainEventDispatcher } from '../modules/Globals.js';
import { getLength } from 'ol/sphere.js';
import { Feature } from 'ol';
import { Point, LineString } from 'ol/geom.js';

/**
 * @class
 * @name Edition
 */
export default class Edition {

    /**
     * Create an edition instance
     * @param {object}   lizmap3   - The old lizmap object
     */
    constructor(lizmap3) {
        this._lizmap3 = lizmap3;

        this.drawFeatureActivated = false;
        this._layerId = undefined;
        this.layerGeometry = undefined;
        this.drawControl = undefined;
        this._lastSegmentLength = undefined;
        this._geometryChangedListener = null;
        this._featureDrawnListener = null;
        this._geolocationListener = null;
        this._savedDrawColor = null;

        lizmap3.events.on({
            lizmapeditiondrawfeatureactivated: (properties) => {
                this.drawFeatureActivated = true;
                this.layerGeometry = properties.editionConfig.geometryType;
                this.drawControl = properties.drawControl;
                this.activateDigitizing();
                mainEventDispatcher.dispatch('edition.drawFeatureActivated');
            },
            lizmapeditiondrawfeaturedeactivated: () => {
                this.drawFeatureActivated = false;
                this.layerGeometry = undefined;
                this.drawControl = undefined;
                this.lastSegmentLength = undefined;
                this.deactivateDigitizing();
                mainEventDispatcher.dispatch('edition.drawFeatureActivated');
            },
            lizmapeditionformdisplayed: (evt) => {
                this._layerId = (evt['layerId']);
                mainEventDispatcher.dispatch('edition.formDisplayed');
            },
            lizmapeditionformclosed: () => {
                this.deactivateDigitizing();
                mainEventDispatcher.dispatch('edition.formClosed');
            }
        });
    }

    /**
     * Get the digitizing web component element
     * @returns {HTMLElement|null}
     */
    get digitizingElement() {
        return document.querySelector('lizmap-digitizing[context="edition"]');
    }

    get layerId() {
        return this._layerId;
    }

    get hasEditionLayers() {
        return 'editionLayers' in this._lizmap3.config;
    }

    get editLayer() {
        const editLayer = this._lizmap3.map.getLayersByName('editLayer');
        if (editLayer.length === 1) {
            return editLayer[0];
        } else {
            return undefined;
        }
    }

    get modifyFeatureControl(){
        const modifyFeatureCtrls = this._lizmap3.map.getControlsByClass('OpenLayers.Control.ModifyFeature');
        return (modifyFeatureCtrls.filter(ctrl => ctrl.layer.name === "editLayer"))[0];
    }

    get lastSegmentLength() {
        return this._lastSegmentLength;
    }

    set lastSegmentLength(lastSegmentLength) {
        lastSegmentLength = parseFloat(lastSegmentLength);
        if (this._lastSegmentLength !== lastSegmentLength) {
            this._lastSegmentLength = lastSegmentLength;

            mainEventDispatcher.dispatch('edition.lastSegmentLength');
        }
    }

    /**
     * Activate the digitizing module for edition
     */
    activateDigitizing() {
        if (!this.layerGeometry) return;

        // Map edition geometry types to digitizing tools
        const toolMap = { point: 'point', line: 'line', polygon: 'polygon' };
        const tool = toolMap[this.layerGeometry] || 'point';

        // Set digitizing context to edition
        mainLizmap.digitizing.context = 'edition';
        mainLizmap.digitizing.singlePartGeometry = true;

        // Force blue color for edition (like OL2 style) without persisting to localStorage
        this._savedDrawColor = mainLizmap.digitizing.drawColor;
        mainLizmap.digitizing._drawColor = '#3388ff';
        mainEventDispatcher.dispatch({ type: 'digitizing.drawColor', color: '#3388ff' });

        // Load existing geometry from form if editing an existing feature
        const eform = document.querySelector('#edition-form-container form');
        if (eform) {
            const gColumn = eform.querySelector('input[name="liz_geometryColumn"]')?.value;
            const srid = eform.querySelector('input[name="liz_srid"]')?.value;
            const wkt = gColumn ? eform.querySelector(`input[name="${gColumn}"]`)?.value : '';
            if (wkt) {
                mainLizmap.digitizing.loadFeatureFromWKT(wkt, srid);
                // Switch to edit mode since we have an existing feature
                mainLizmap.digitizing.isEdited = true;
            } else {
                // Activate the drawing tool for new geometry
                mainLizmap.digitizing.toolSelected = tool;
            }
        } else {
            mainLizmap.digitizing.toolSelected = tool;
        }

        // Listen to geometry changes and update form
        if (!this._geometryChangedListener) {
            this._geometryChangedListener = () => {
                this.updateFormGeometry();
            };
            mainEventDispatcher.addListener(
                this._geometryChangedListener,
                'digitizing.geometryChanged'
            );
        }

        // Auto-switch to edit mode after first feature is drawn (like OL2 behavior)
        if (!this._featureDrawnListener) {
            this._featureDrawnListener = () => {
                if (mainLizmap.digitizing.context === 'edition' && mainLizmap.digitizing.featureDrawn) {
                    mainLizmap.digitizing.isEdited = true;
                }
            };
            mainEventDispatcher.addListener(
                this._featureDrawnListener,
                'digitizing.featureDrawn'
            );
        }

        // Listen to geolocation position for GPS-linked drawing
        if (!this._geolocationListener) {
            this._geolocationListener = () => {
                this._handleGeolocationPosition();
            };
            mainEventDispatcher.addListener(
                this._geolocationListener,
                'geolocation.position'
            );
        }
    }

    /**
     * Handle geolocation position updates for GPS-linked edition
     * @private
     */
    _handleGeolocationPosition() {
        if (!mainLizmap.geolocation.isLinkedToEdition) return;
        if (!this.layerGeometry) return;

        const mapProjection = mainLizmap.map.getView().getProjection().getCode();
        const position = mainLizmap.geolocation.getPositionInCRS(mapProjection);
        if (!position || !position[0] || !position[1]) return;

        const coord = [position[0], position[1]];

        if (this.layerGeometry === 'point') {
            // For point geometry: create/move point at GPS position
            const feature = new Feature(new Point(coord));
            mainLizmap.digitizing._drawSource.clear();
            mainLizmap.digitizing._drawSource.addFeature(feature);
            mainEventDispatcher.dispatch('digitizing.geometryChanged');
        } else if (this.layerGeometry === 'line' || this.layerGeometry === 'polygon') {
            // For line/polygon: append coordinate if draw interaction is active
            const drawInteraction = mainLizmap.digitizing._drawInteraction;
            if (drawInteraction && typeof drawInteraction.appendCoordinates === 'function') {
                drawInteraction.appendCoordinates([coord]);
            }
        }

        // Update last segment length
        const features = mainLizmap.digitizing.featureDrawn;
        if (features && features.length > 0) {
            const geom = features[0].getGeometry();
            if (geom.getType() === 'LineString') {
                const coords = geom.getCoordinates();
                if (coords.length >= 2) {
                    const lastSegment = new LineString([coords[coords.length - 2], coords[coords.length - 1]]);
                    this.lastSegmentLength = getLength(lastSegment, {
                        projection: mainLizmap.map.getView().getProjection()
                    }).toFixed(3);
                }
            }
        }
    }

    /**
     * Deactivate the digitizing module for edition
     */
    deactivateDigitizing() {
        // Remove geometry change listener
        if (this._geometryChangedListener) {
            mainEventDispatcher.removeListener(
                this._geometryChangedListener,
                'digitizing.geometryChanged'
            );
            this._geometryChangedListener = null;
        }

        // Remove feature drawn listener
        if (this._featureDrawnListener) {
            mainEventDispatcher.removeListener(
                this._featureDrawnListener,
                'digitizing.featureDrawn'
            );
            this._featureDrawnListener = null;
        }

        // Remove geolocation listener
        if (this._geolocationListener) {
            mainEventDispatcher.removeListener(
                this._geolocationListener,
                'geolocation.position'
            );
            this._geolocationListener = null;
        }

        // Clear digitizing features for edition context
        if (mainLizmap.digitizing && mainLizmap.digitizing.context === 'edition') {
            mainLizmap.digitizing.toolSelected = 'deactivate';
            mainLizmap.digitizing.eraseAll();
            mainLizmap.digitizing.context = 'draw';

            // Restore user's draw color
            if (this._savedDrawColor) {
                mainLizmap.digitizing._drawColor = this._savedDrawColor;
                mainEventDispatcher.dispatch({ type: 'digitizing.drawColor', color: this._savedDrawColor });
                this._savedDrawColor = null;
            }
        }
    }

    /**
     * Update the edition form geometry field from the digitizing module
     */
    updateFormGeometry() {
        const eform = document.querySelector('#edition-form-container form');
        if (!eform) return;
        const gColumn = eform.querySelector('input[name="liz_geometryColumn"]')?.value;
        const srid = eform.querySelector('input[name="liz_srid"]')?.value;
        if (!gColumn || !srid) return;

        const wkt = mainLizmap.digitizing.getFeatureAsWKT(srid);
        const input = eform.querySelector(`input[name="${gColumn}"]`);
        if (input) {
            input.value = wkt;
            input.dispatchEvent(new Event('change'));
        }

        // Backward compat event
        const featureId = eform.querySelector('input[name="liz_featureId"]')?.value;
        const layerId = eform.querySelector('input[name="liz_layerId"]')?.value;
        lizMap.events.triggerEvent('lizmapeditiongeometryupdated', {
            layerId, featureId, geometry: wkt, srid
        });
    }

    /**
     * Fetch editable features for given array of layer IDs
     * @param {Array} layerIds - Array of layer IDs
     * @param {Array} layerFeatures - filter on features
     */
    fetchEditableFeatures(layerIds, layerFeatures = []){
        if (Array.isArray(layerIds)){
            const fetchers = [];
            let layerIndex = 0;
            const layersNames = [];
            for (const layerId of layerIds) {
                // take layer name from requests, not from response, since response could be an empty array
                layersNames.push(this._lizmap3.getLayerConfigById(layerId)[0]);
                fetchers.push(fetch(globalThis['lizUrls'].edition.replace('getFeature', 'editableFeatures'),{
                    "method": "POST",
                    "body": new URLSearchParams({
                        repository: globalThis['lizUrls'].params.repository,
                        project: globalThis['lizUrls'].params.project,
                        layerId: layerId,
                        features: layerFeatures[layerIndex] ?? ''
                    })
                }).then(response => {
                    return response.json();
                }));

                layerIndex++;
            }

            layerIndex = 0;
            Promise.all(fetchers).then(responses => {
                const editableFeatures = [];
                for (const response of responses) {
                    if (response?.['success'] && response?.['status'] === 'restricted') {
                        for (const feature of response.features) {
                            editableFeatures.push(feature);
                        }

                        // Dispatch event only if there is a restriction
                        mainEventDispatcher.dispatch({
                            type: 'edition.editableFeatures',
                            properties: {
                                editableFeatures: editableFeatures,
                                layerName:layersNames[layerIndex]
                            }
                        });
                    }

                    layerIndex++;
                }
            });
        }
    }
}
