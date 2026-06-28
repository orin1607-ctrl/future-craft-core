/**
 * Filter Taxonomy SSOT — activity types, asset types, sub-category schemas.
 * Extensible without architecture changes: add rows here for new channels.
 */
(function () {
  'use strict';

  var ACTIVITY_TYPES = [
    { id: 'seo', labelHe: 'SEO', assetTypes: ['website'], subSchema: 'website_pages' },
    { id: 'google_ads', labelHe: 'Google Ads', assetTypes: ['google_ads_account'], subSchema: 'google_ads' },
    { id: 'google_business', labelHe: 'Google Business', assetTypes: ['gbp'], subSchema: 'gbp' },
    { id: 'website', labelHe: 'אתר', assetTypes: ['website', 'landing'], subSchema: 'website_pages' },
    { id: 'facebook', labelHe: 'Facebook', assetTypes: ['facebook'], subSchema: 'facebook' },
    { id: 'instagram', labelHe: 'Instagram', assetTypes: ['instagram'], subSchema: 'instagram' },
    { id: 'youtube', labelHe: 'YouTube', assetTypes: ['youtube'], subSchema: 'youtube' },
    { id: 'tiktok', labelHe: 'TikTok', assetTypes: ['tiktok'], subSchema: 'tiktok' },
    { id: 'linkedin', labelHe: 'LinkedIn', assetTypes: ['linkedin'], subSchema: 'linkedin' },
    { id: 'content', labelHe: 'תוכן', assetTypes: ['website', 'blog'], subSchema: 'website_pages' },
    { id: 'crm', labelHe: 'CRM', assetTypes: ['crm'], subSchema: 'crm' },
    { id: 'landing', labelHe: 'דף נחיתה', assetTypes: ['landing'], subSchema: 'website_pages' },
  ];

  var ASSET_TYPES = [
    { id: 'website', labelHe: 'אתר', icon: '🌐' },
    { id: 'landing', labelHe: 'דף נחיתה', icon: '📄' },
    { id: 'gbp', labelHe: 'Google Business', icon: '📍' },
    { id: 'google_ads_account', labelHe: 'Google Ads', icon: '📢' },
    { id: 'facebook', labelHe: 'Facebook', icon: '📘' },
    { id: 'instagram', labelHe: 'Instagram', icon: '📸' },
    { id: 'youtube', labelHe: 'YouTube', icon: '▶️' },
    { id: 'tiktok', labelHe: 'TikTok', icon: '🎵' },
    { id: 'linkedin', labelHe: 'LinkedIn', icon: '💼' },
    { id: 'blog', labelHe: 'בלוג', icon: '📝' },
    { id: 'ecommerce', labelHe: 'חנות אונליין', icon: '🛒' },
    { id: 'crm', labelHe: 'CRM', icon: '👥' },
  ];

  var SUB_CATEGORY_SCHEMAS = {
    website_pages: [
      { id: 'home', labelHe: 'עמוד בית', matchType: 'page' },
      { id: 'service', labelHe: 'עמוד שירות', matchType: 'page' },
      { id: 'article', labelHe: 'עמוד מאמר', matchType: 'page' },
      { id: 'product', labelHe: 'עמוד מוצר', matchType: 'page' },
      { id: 'category', labelHe: 'עמוד קטגוריה', matchType: 'page' },
      { id: 'other', labelHe: 'כל עמוד אחר', matchType: 'page' },
    ],
    google_ads: [
      { id: 'account', labelHe: 'חשבון', matchType: 'entity' },
      { id: 'campaign', labelHe: 'קמפיין', matchType: 'entity' },
      { id: 'ad_group', labelHe: 'קבוצת מודעות', matchType: 'entity' },
      { id: 'ad', labelHe: 'מודעה', matchType: 'entity' },
      { id: 'keyword', labelHe: 'מילת מפתח', matchType: 'entity' },
    ],
    gbp: [
      { id: 'profile', labelHe: 'כרטיס עסק', matchType: 'entity' },
      { id: 'reviews', labelHe: 'ביקורות', matchType: 'entity' },
      { id: 'posts', labelHe: 'פוסטים', matchType: 'entity' },
      { id: 'photos', labelHe: 'תמונות', matchType: 'entity' },
      { id: 'services', labelHe: 'שירותים', matchType: 'entity' },
      { id: 'qa', labelHe: 'שאלות ותשובות', matchType: 'entity' },
    ],
    facebook: [
      { id: 'page', labelHe: 'דף', matchType: 'entity' },
      { id: 'campaign', labelHe: 'קמפיין', matchType: 'entity' },
      { id: 'ad_set', labelHe: 'קבוצת מודעות', matchType: 'entity' },
      { id: 'ad', labelHe: 'מודעה', matchType: 'entity' },
      { id: 'post', labelHe: 'פוסט', matchType: 'entity' },
    ],
    instagram: [
      { id: 'profile', labelHe: 'פרופיל', matchType: 'entity' },
      { id: 'post', labelHe: 'פוסט', matchType: 'entity' },
      { id: 'reel', labelHe: 'ריל', matchType: 'entity' },
      { id: 'story', labelHe: 'סטורי', matchType: 'entity' },
      { id: 'campaign', labelHe: 'קמפיין', matchType: 'entity' },
    ],
    youtube: [
      { id: 'channel', labelHe: 'ערוץ', matchType: 'entity' },
      { id: 'video', labelHe: 'סרטון', matchType: 'entity' },
      { id: 'playlist', labelHe: 'Playlist', matchType: 'entity' },
      { id: 'shorts', labelHe: 'Shorts', matchType: 'entity' },
    ],
    tiktok: [
      { id: 'profile', labelHe: 'פרופיל', matchType: 'entity' },
      { id: 'video', labelHe: 'סרטון', matchType: 'entity' },
      { id: 'campaign', labelHe: 'קמפיין', matchType: 'entity' },
    ],
    linkedin: [
      { id: 'page', labelHe: 'דף', matchType: 'entity' },
      { id: 'campaign', labelHe: 'קמפיין', matchType: 'entity' },
      { id: 'post', labelHe: 'פוסט', matchType: 'entity' },
    ],
    crm: [
      { id: 'lead', labelHe: 'ליד', matchType: 'entity' },
      { id: 'contact', labelHe: 'איש קשר', matchType: 'entity' },
      { id: 'deal', labelHe: 'עסקה', matchType: 'entity' },
    ],
  };

  var DATE_PRESETS = [
    { id: 'today', labelHe: 'היום' },
    { id: 'week', labelHe: 'השבוע' },
    { id: 'month', labelHe: 'החודש' },
    { id: 'custom', labelHe: 'טווח מותאם אישית' },
  ];

  var STATUS_OPTIONS = [
    { id: 'active', labelHe: 'פעיל' },
    { id: 'pending', labelHe: 'ממתין' },
    { id: 'in_progress', labelHe: 'בעבודה' },
    { id: 'done', labelHe: 'הושלם' },
    { id: 'paused', labelHe: 'נעצר' },
    { id: 'error', labelHe: 'שגיאה' },
  ];

  var CASCADE_STEPS = [
    'clientId', 'activityType', 'campaignId', 'assetId',
    'subCategory', 'specificItem', 'dateRange', 'status', 'freeSearch',
  ];

  var PAGE_KINDS = ['home', 'service', 'article', 'product', 'category', 'other'];

  function isPageKind(id) {
    return PAGE_KINDS.indexOf(id) >= 0;
  }

  function getActivityType(id) {
    return ACTIVITY_TYPES.find(function (a) { return a.id === id; }) || null;
  }

  function getAssetType(id) {
    return ASSET_TYPES.find(function (a) { return a.id === id; }) || null;
  }

  function getSubSchema(schemaId) {
    return SUB_CATEGORY_SCHEMAS[schemaId] || [];
  }

  function subSchemaForActivity(activityTypeId) {
    var act = getActivityType(activityTypeId);
    return act ? act.subSchema : null;
  }

  window.FilterTaxonomy = {
    VERSION: 1,
    ACTIVITY_TYPES: ACTIVITY_TYPES,
    ASSET_TYPES: ASSET_TYPES,
    SUB_CATEGORY_SCHEMAS: SUB_CATEGORY_SCHEMAS,
    DATE_PRESETS: DATE_PRESETS,
    STATUS_OPTIONS: STATUS_OPTIONS,
    CASCADE_STEPS: CASCADE_STEPS,
    PAGE_KINDS: PAGE_KINDS,
    isPageKind: isPageKind,
    getActivityType: getActivityType,
    getAssetType: getAssetType,
    getSubSchema: getSubSchema,
    subSchemaForActivity: subSchemaForActivity,
  };
})();
