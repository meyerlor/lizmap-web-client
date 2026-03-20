/**
 * @module modules/Snapping.js
 * @name Snapping
 * @copyright 2023 3Liz
 * @license MPL-2.0
 */

import { mainLizmap, mainEventDispatcher } from '../modules/Globals.js';
import Edition from './Edition.js';
import { MapRootState } from './state/MapLayer.js';
import { TreeRootState } from './state/LayerTree.js';

import { Snap } from 'ol/interaction.js';
import { Vector as VectorSource } from 'ol/source.js';
import { Vector as VectorLayer } from 'ol/layer.js';
import GeoJSON from 'ol/format/GeoJSON.js';

/**
 * @class
 * @name Snapping
 */
export default class Snapping {

    /**
     * Create a snapping instance
     * @param {Edition}       edition      - The edition module
     * @param {MapRootState}  rootMapGroup - Root map group
     * @param {TreeRootState} layerTree    - Root tree layer group
     * @param {object}        lizmap3      - The old lizmap object
     */
    constructor(edition, rootMapGroup, layerTree, lizmap3) {

        this._edition = edition;
        this._rootMapGroup = rootMapGroup;
        this._layerTree = layerTree;
        this._lizmap3 = lizmap3;

        this._active = false;
        this._snapLayersRefreshable = false;

        this._maxFeatures = 1000;
        this._restrictToMapExtent = true;
        this._config = undefined;
        this._snapEnabled = {};
        this._snapToggled = {};
        this._snapLayers = [];

        // Create OL6 snap source and layer
        this._snapSource = new VectorSource();
        this._snapLayer = new VectorLayer({
            source: this._snapSource,
            visible: false
        });
        this._snapLayer.setProperties({ name: 'snaplayer' });

        // Will be added to map once mainLizmap.map is ready
        this._snapInteraction = null;
        this._mapReady = false;

        this._setSnapLayersRefreshable = () => {
            if(this._active){
                this.snapLayersRefreshable = true;
            }
        }

        this._setSnapLayersVisibility = () => {
            if(this._active){
                this._snapLayers.forEach((layer)=>{
                    this._snapEnabled[layer] = this.getLayerTreeVisibility(layer);
                })

                this._sortSnapLayers();
                const config = structuredClone(this._config);
                config.snap_layers = this._snapLayers;
                config.snap_enabled = this._snapEnabled;

                this.config = config;
                this.snapLayersRefreshable = true;

                // dispatch an event, it might be useful to know when the list of visible layer for snap changed
                mainEventDispatcher.dispatch('snapping.layer.visibility.changed');
            }
        }

        this._sortSnapLayers = () => {
            let snapLayers = [...this._snapLayers];
            let visibleLayers = [];
            for (let id in this._snapEnabled) {
                if(this._snapEnabled[id]){
                    let visibileLayer = snapLayers.splice(snapLayers.indexOf(id),1)
                    visibleLayers = visibleLayers.concat(visibileLayer)
                }
            }
            visibleLayers.sort();
            snapLayers.sort();
            this._snapLayers = visibleLayers.concat(snapLayers);
        }

        // Ensure snap layer is added to map when available
        this._ensureMapReady = () => {
            if (!this._mapReady && mainLizmap.map) {
                mainLizmap.map.addToolLayer(this._snapLayer);
                this._mapReady = true;
            }
        };

        // Activate snap when a layer is edited
        mainEventDispatcher.addListener(
            () => {
                this._ensureMapReady();

                // Get snapping configuration for edited layer
                for (const editionLayer in this._lizmap3.config.editionLayers) {
                    if (this._lizmap3.config.editionLayers.hasOwnProperty(editionLayer)) {
                        if (this._lizmap3.config.editionLayers[editionLayer].layerId === this._edition.layerId){
                            const editionLayerConfig = this._lizmap3.config.editionLayers[editionLayer];
                            if (editionLayerConfig.hasOwnProperty('snap_layers') && editionLayerConfig.snap_layers.length > 0){

                                this._snapLayers = [...editionLayerConfig.snap_layers];
                                this._snapLayers.forEach((layer)=>{
                                    this._snapEnabled[layer] = this.getLayerTreeVisibility(layer);
                                })
                                this._snapLayers.forEach((layer)=>{
                                    // on init enable snap by default on visible layers
                                    this._snapToggled[layer] = this.getLayerTreeVisibility(layer);
                                })

                                // sorting of layers by name and put disabled layers on bottom of the list
                                this._sortSnapLayers();

                                this.config = {
                                    'snap_layers': this._snapLayers,
                                    'snap_enabled': this._snapEnabled,
                                    'snap_on_layers':this._snapToggled,
                                    'snap_vertices': (editionLayerConfig.hasOwnProperty('snap_vertices') && editionLayerConfig.snap_vertices === 'True') ? true : false,
                                    'snap_segments': (editionLayerConfig.hasOwnProperty('snap_segments') && editionLayerConfig.snap_segments === 'True') ? true : false,
                                    'snap_intersections': (editionLayerConfig.hasOwnProperty('snap_intersections') && editionLayerConfig.snap_intersections === 'True') ? true : false,
                                    'snap_vertices_tolerance': editionLayerConfig.hasOwnProperty('snap_vertices_tolerance') ? editionLayerConfig.snap_vertices_tolerance : 10,
                                    'snap_segments_tolerance': editionLayerConfig.hasOwnProperty('snap_segments_tolerance') ? editionLayerConfig.snap_segments_tolerance : 10,
                                    'snap_intersections_tolerance': editionLayerConfig.hasOwnProperty('snap_intersections_tolerance') ? editionLayerConfig.snap_intersections_tolerance : 10
                                };
                            }
                        }
                    }
                }

                if (this._config !== undefined){
                    // Listen to moveend event and to layers visibility changes to able data refreshing
                    mainLizmap.map.on('moveend', this._setSnapLayersRefreshable);
                    this._rootMapGroup.addListener(
                        this._setSnapLayersVisibility,
                        ['layer.visibility.changed','group.visibility.changed']
                    );
                }
            },
            'edition.formDisplayed'
        );

        // Clean snap when edition ends
        mainEventDispatcher.addListener(
            () => {
                this.active = false;
                this._snapSource.clear();
                this.config = undefined;

                // Remove listener to moveend event and layers visibility event
                if (mainLizmap.map) {
                    mainLizmap.map.un('moveend', this._setSnapLayersRefreshable);
                }
                this._rootMapGroup.removeListener(
                    this._setSnapLayersVisibility,
                    ['layer.visibility.changed','group.visibility.changed']
                )
            },
            'edition.formClosed'
        );
    }

    getSnappingData () {
        // Empty snapping source first
        this._snapSource.clear();

        // filter only visible layers and toggled layers on the the snap list
        const currentSnapLayers = this._snapLayers.filter(
            (layerId) => this._snapEnabled[layerId] && this._snapToggled[layerId]
        );

        const mapProjection = mainLizmap.map.getView().getProjection().getCode();

        // TODO : group async calls with Promises
        for (const snapLayer of currentSnapLayers) {

            lizMap.getFeatureData(this._lizmap3.getLayerConfigById(snapLayer)[0], null, null, 'geom', this._restrictToMapExtent, null, this._maxFeatures,
                (fName, fFilter, fFeatures) => {

                    // Transform features
                    const snapLayerConfig = lizMap.config.layers[fName];
                    let snapLayerCrs = snapLayerConfig['featureCrs'];
                    if (!snapLayerCrs) {
                        snapLayerCrs = snapLayerConfig['crs'];
                    }

                    const gFormat = new GeoJSON();
                    const tfeatures = gFormat.readFeatures(
                        { type: 'FeatureCollection', features: fFeatures },
                        {
                            dataProjection: snapLayerCrs,
                            featureProjection: mapProjection
                        }
                    );

                    // Add features
                    this._snapSource.addFeatures(tfeatures);
                });
        }

        this.snapLayersRefreshable = false;
    }

    toggle(){
        this.active = !this._active;
    }
    /**
     * Getting the layer visibility from the layer tree state
     * @param   {string} layerId - the layer id
     * @returns {boolean} the layer visibility
     */
    getLayerTreeVisibility(layerId){
        let visible = false;
        let layerConfig = this._lizmap3.getLayerConfigById(layerId);

        if(layerConfig && layerConfig[0]) {
            try {
                visible = this._layerTree.getTreeLayerByName(layerConfig[0]).visibility
            } catch {
                visible = false
            }
        }
        return visible;
    }
    /**
     * Getting the layer tile or the layer name for snap layers list
     * @param   {string} layerId - the layer id
     * @returns {string} the layer title or layer name
     */
    getLayerTitle(layerId){
        let layerConfig = this._lizmap3.getLayerConfigById(layerId);
        if (layerConfig) {
            return layerConfig[1].title || layerConfig[1].name;
        }
        return "";
    }

    get snapEnabled(){
        return this._snapEnabled;
    }

    set snapToggled(layerId){
        this._snapToggled[layerId] = !this._snapToggled[layerId];

        const config = structuredClone(this._config);
        config.snap_on_layers = this._snapToggled;

        this.config = config;
        this.snapLayersRefreshable = true;
    }

    get snapLayersRefreshable(){
        return this._snapLayersRefreshable;
    }

    set snapLayersRefreshable(refreshable) {
        this._snapLayersRefreshable = refreshable;
        mainEventDispatcher.dispatch('snapping.refreshable');
    }

    get active() {
        return this._active;
    }

    set active(active) {
        this._active = active;

        // (de)activate snap interaction
        if (this._active) {
            this.getSnappingData();
            this._createSnapInteraction();
        } else {
            // Disable refresh button when snapping is inactive
            this.snapLayersRefreshable = false;
            this._removeSnapInteraction();
        }

        // Set snap layer visibility
        this._snapLayer.setVisible(this._active);

        mainEventDispatcher.dispatch('snapping.active');
    }

    /**
     * Create and add the OL6 Snap interaction to the map
     * @private
     */
    _createSnapInteraction() {
        this._removeSnapInteraction();

        if (!this._config || !mainLizmap.map) return;

        this._snapInteraction = new Snap({
            source: this._snapSource,
            vertex: this._config.snap_vertices || this._config.snap_intersections,
            edge: this._config.snap_segments,
            pixelTolerance: Math.max(
                parseInt(this._config.snap_vertices_tolerance) || 10,
                parseInt(this._config.snap_segments_tolerance) || 10
            )
        });

        mainLizmap.map.addInteraction(this._snapInteraction);
    }

    /**
     * Remove the OL6 Snap interaction from the map
     * @private
     */
    _removeSnapInteraction() {
        if (this._snapInteraction && mainLizmap.map) {
            mainLizmap.map.removeInteraction(this._snapInteraction);
            this._snapInteraction = null;
        }
    }

    get config() {
        return this._config;
    }

    set config(config) {
        this._config = config;

        // Re-create snap interaction with updated config when active
        if (this._active && this._config) {
            this._createSnapInteraction();
        }

        mainEventDispatcher.dispatch('snapping.config');
    }
}
