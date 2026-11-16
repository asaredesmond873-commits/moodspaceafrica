import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { type FormConfig, type FormField, type FormFieldType, SCHEMA_LIMITS } from '../types';
import { generateSafeId } from '../utils/media';

interface FormBuilderProps {
  hasForm: boolean;
  onToggleHasForm: (next: boolean) => void;
  formConfig: FormConfig;
  onChange: (next: FormConfig) => void;
}

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Short Text Response' },
  { value: 'textarea', label: 'Long Paragraph Response' },
  { value: 'select', label: 'Multiple Choice / Dropdown' },
  { value: 'email', label: 'Email Address' },
  { value: 'tel', label: 'Phone / WhatsApp Number' },
  { value: 'checkbox', label: 'Yes / No Checkbox' },
];

const FORM_PRESETS: { name: string; config: FormConfig }[] = [
  {
    name: 'Event RSVP',
    config: {
      title: 'Event Registration & Seat Hold',
      description: 'Reserve your spot and let us know if you need accessibility or group seating.',
      isOpen: true,
      fields: [
        { id: 'full_name', label: 'Full Name', type: 'text', required: true, options: [] },
        { id: 'phone', label: 'WhatsApp / Phone Number', type: 'tel', required: true, options: [] },
        {
          id: 'ticket_tier',
          label: 'Preferred Session / Tier',
          type: 'select',
          required: true,
          options: ['Standard Entry', 'VIP Lounge', 'Creator Press Pass'],
        },
        { id: 'updates', label: 'Receive event reminders', type: 'checkbox', required: false, options: [] },
      ],
    },
  },
  {
    name: 'Promo Claim',
    config: {
      title: 'Claim Promotional Offer',
      description: 'Enter your contact details to lock in this limited-time offer.',
      isOpen: true,
      fields: [
        { id: 'customer_name', label: 'Full Name', type: 'text', required: true, options: [] },
        { id: 'email', label: 'Email Address', type: 'email', required: true, options: [] },
        { id: 'city', label: 'Delivery City', type: 'text', required: false, options: [] },
      ],
    },
  },
  {
    name: 'Vendor Inquiry',
    config: {
      title: 'Business & Partner Application',
      description: 'Tell us about your brand or offering so our team can follow up.',
      isOpen: true,
      fields: [
        { id: 'brand_name', label: 'Brand / Organization Name', type: 'text', required: true, options: [] },
        { id: 'contact', label: 'Email or WhatsApp', type: 'text', required: true, options: [] },
        { id: 'pitch', label: 'Describe what you are showcasing', type: 'textarea', required: true, options: [] },
      ],
    },
  },
];

export function FormBuilder({
  hasForm,
  onToggleHasForm,
  formConfig,
  onChange,
}: FormBuilderProps) {
  const addField = () => {
    if (formConfig.fields.length >= SCHEMA_LIMITS.FORM_FIELDS_MAX) return;
    const nextField: FormField = {
      id: generateSafeId('fld'),
      label: '',
      type: 'text',
      required: false,
      options: [],
    };
    onChange({
      ...formConfig,
      fields: [...formConfig.fields, nextField],
    });
  };

  const handleToggleMode = (enableForm: boolean) => {
    onToggleHasForm(enableForm);
    if (enableForm && formConfig.fields.length === 0) {
      onChange({
        ...formConfig,
        isOpen: true,
        fields: [
          {
            id: generateSafeId('fld'),
            label: '',
            type: 'text',
            required: true,
            options: [],
          },
        ],
      });
    }
  };

  const updateField = (index: number, patch: Partial<FormField>) => {
    const next = formConfig.fields.map((f, idx) => (idx === index ? { ...f, ...patch } : f));
    onChange({ ...formConfig, fields: next });
  };

  const removeField = (index: number) => {
    onChange({
      ...formConfig,
      fields: formConfig.fields.filter((_, idx) => idx !== index),
    });
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= formConfig.fields.length) return;
    const copy = [...formConfig.fields];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    onChange({ ...formConfig, fields: copy });
  };

  return (
    <div className="border border-[#E7E5E0] rounded-xl bg-[#FAF9F7] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold text-[#141413]">
            Optional Response Form
          </h4>
          <p className="text-xs text-[#5E5D59] mt-0.5">
            Not every post needs a form. Choose &ldquo;No Form&rdquo; for standard posts, or add
            your own custom questions and response types.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-white border border-[#E7E5E0] rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => handleToggleMode(false)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              !hasForm
                ? 'bg-[#141413] text-white'
                : 'text-[#5E5D59] hover:text-[#141413]'
            }`}
          >
            No Form
          </button>
          <button
            type="button"
            onClick={() => handleToggleMode(true)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              hasForm
                ? 'bg-[#0E7C5B] text-white'
                : 'text-[#5E5D59] hover:text-[#141413]'
            }`}
          >
            Add Custom Form
          </button>
        </div>
      </div>

      {hasForm && (
        <div className="space-y-4 pt-3 border-t border-[#E7E5E0]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5E5D59] mb-1">
                Form Title
              </label>
              <input
                type="text"
                maxLength={SCHEMA_LIMITS.FORM_TITLE_MAX}
                value={formConfig.title}
                onChange={(e) => onChange({ ...formConfig, title: e.target.value })}
                placeholder="e.g. Request Table Booking or Feedback"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
              />
            </div>

            <div className="flex items-end">
              <label className="w-full flex items-center justify-between px-3 py-2 bg-white border border-[#D4D1CA] rounded-lg cursor-pointer">
                <span className="text-sm text-[#141413]">
                  Form Status: <strong>{formConfig.isOpen ? 'Open' : 'Closed'}</strong>
                </span>
                <input
                  type="checkbox"
                  checked={formConfig.isOpen}
                  onChange={(e) => onChange({ ...formConfig, isOpen: e.target.checked })}
                  className="w-4 h-4 accent-[#0E7C5B] cursor-pointer"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5E5D59] mb-1">
              Form Instructions (optional)
            </label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.FORM_DESC_MAX}
              value={formConfig.description}
              onChange={(e) => onChange({ ...formConfig, description: e.target.value })}
              placeholder="Explain what happens after someone submits..."
              className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
            />
          </div>

          {/* Field Editor List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#141413]">
                Your Questions &amp; Response Formats ({formConfig.fields.length}/
                {SCHEMA_LIMITS.FORM_FIELDS_MAX})
              </span>
              <button
                type="button"
                disabled={formConfig.fields.length >= SCHEMA_LIMITS.FORM_FIELDS_MAX}
                onClick={addField}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0E7C5B] bg-white border border-[#0E7C5B] rounded-lg hover:bg-[#0E7C5B] hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Question
              </button>
            </div>

            {formConfig.fields.length === 0 ? (
              <p className="text-xs text-[#5E5D59] py-3 text-center bg-white border border-dashed border-[#D4D1CA] rounded-lg">
                No questions added yet. Click &ldquo;Add Question&rdquo; to write your own prompt.
              </p>
            ) : (
              <div className="space-y-2.5">
                {formConfig.fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="bg-white border border-[#E7E5E0] rounded-lg p-3 space-y-2.5"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-medium text-[#5E5D59] mb-1">
                          Question {index + 1}
                        </label>
                        <input
                          type="text"
                          maxLength={SCHEMA_LIMITS.FORM_FIELD_LABEL_MAX}
                          value={field.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                          placeholder="e.g. Which ticket tier or city?"
                          className="w-full px-2.5 py-1.5 text-sm border border-[#D4D1CA] rounded-md focus:outline-none focus:border-[#0E7C5B]"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-medium text-[#5E5D59] mb-1">
                          Preferred Response Type
                        </label>
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const nextType = e.target.value as FormFieldType;
                            updateField(index, {
                              type: nextType,
                              options:
                                nextType === 'select' && field.options.length === 0
                                  ? ['Choice 1', 'Choice 2']
                                  : field.options,
                            });
                          }}
                          className="w-full px-2.5 py-1.5 text-sm border border-[#D4D1CA] rounded-md bg-white focus:outline-none focus:border-[#0E7C5B]"
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3 flex items-center justify-between sm:justify-end gap-2 pb-1">
                        <label className="inline-flex items-center gap-1.5 text-xs text-[#5E5D59] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateField(index, { required: e.target.checked })}
                            className="accent-[#0E7C5B] cursor-pointer"
                          />
                          Required
                        </label>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveField(index, -1)}
                            disabled={index === 0}
                            aria-label="Move question up"
                            className="p-1 text-[#5E5D59] hover:text-[#141413] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveField(index, 1)}
                            disabled={index === formConfig.fields.length - 1}
                            aria-label="Move question down"
                            className="p-1 text-[#5E5D59] hover:text-[#141413] disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeField(index)}
                            aria-label="Remove question"
                            className="p-1 text-[#5E5D59] hover:text-[#B91C1C] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {field.type === 'select' && (
                      <div>
                        <label className="block text-[11px] font-medium text-[#5E5D59] mb-1">
                          Preferred Response Choices (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={field.options.join(', ')}
                          onChange={(e) =>
                            updateField(index, {
                              options: e.target.value
                                .split(',')
                                .map((s) => s.trimStart())
                                .slice(0, 20),
                            })
                          }
                          placeholder="e.g. Early Bird, VIP Table, Backstage"
                          className="w-full px-2.5 py-1.5 text-xs border border-[#D4D1CA] rounded-md focus:outline-none focus:border-[#0E7C5B]"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional Starter Templates */}
          <div className="pt-2 border-t border-[#E7E5E0] flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-[#5E5D59] mr-1">
              Optional templates:
            </span>
            {FORM_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => onChange(preset.config)}
                className="px-2.5 py-1 text-[11px] font-medium rounded-md border border-[#D4D1CA] bg-white text-[#5E5D59] hover:border-[#0E7C5B] hover:text-[#0E7C5B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
