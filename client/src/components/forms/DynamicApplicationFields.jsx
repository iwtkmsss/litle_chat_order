import { getUnitFieldName } from '../../config/applicationFormConfig';
import { formatUkrainianPhone } from '../../utils';

export function DynamicApplicationFields({
  applicationType,
  disabled = false,
  errors = {},
  hiddenFields = [],
  onChange,
  requiredFields = [],
  values,
}) {
  const hiddenFieldSet = new Set(hiddenFields);
  const requiredFieldSet = new Set(requiredFields);

  return (
    <>
      {applicationType.groups.map((group) => {
        const fields = group.fields.filter((field) => !hiddenFieldSet.has(field.name));

        if (fields.length === 0) {
          return null;
        }

        return (
          <div className="appendix-form-section field-block--wide" key={group.id}>
            <div>
              <span className="section-kicker">{applicationType.appendix}</span>
              <h3>{group.title}</h3>
              {group.helpText ? <p className="field-help">{group.helpText}</p> : null}
            </div>

            {fields.map((field) => (
              <DynamicField
                disabled={disabled}
                error={errors[field.name]}
                field={{
                  ...field,
                  required: field.required || requiredFieldSet.has(field.name),
                }}
                key={field.name}
                onChange={onChange}
                unitError={field.unitOptions ? errors[getUnitFieldName(field)] : ''}
                unitValue={field.unitOptions ? values?.[getUnitFieldName(field)] ?? '' : ''}
                value={values?.[field.name] ?? ''}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function isBlank(value) {
  return String(value ?? '').trim() === '';
}

function DynamicField({ disabled, error, field, onChange, unitError = '', unitValue = '', value }) {
  const unitFieldName = field.unitOptions ? getUnitFieldName(field) : '';
  const hasValue = !isBlank(value);
  const describedBy = [
    field.helpText ? `${field.name}-help` : '',
    error ? `${field.name}-error` : '',
    unitError ? `${unitFieldName}-error` : '',
  ].filter(Boolean).join(' ') || undefined;

  function handleChange(event) {
    const nextValue = field.type === 'tel'
      ? formatUkrainianPhone(event.target.value)
      : event.target.value;

    if (field.unitOptions && isBlank(nextValue)) {
      onChange(unitFieldName, '');
    }

    onChange(field.name, nextValue);
  }

  function handleUnitChange(event) {
    onChange(unitFieldName, event.target.value);
  }

  if (field.type === 'textarea') {
    return (
      <label className="field-block field-block--wide">
        <FieldLabel field={field} />
        <textarea
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className="field-input field-textarea"
          disabled={disabled}
          onChange={handleChange}
          placeholder={field.placeholder}
          required={field.required}
          rows={3}
          value={value}
        />
        <FieldMeta error={error} field={field} />
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="field-block">
        <FieldLabel field={field} />
        <select
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className="field-input"
          disabled={disabled}
          onChange={handleChange}
          required={field.required}
          value={value}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldMeta error={error} field={field} />
      </label>
    );
  }

  if (field.type === 'radio') {
    return (
      <fieldset aria-describedby={describedBy} aria-invalid={Boolean(error)} className="field-block dynamic-radio-group">
        <legend>
          <FieldLabel field={field} />
        </legend>
        <div className="radio-option-list">
          {field.options?.map((option) => (
            <label className="access-toggle" key={option.value}>
              <input
                checked={value === option.value}
                disabled={disabled}
                name={field.name}
                onChange={() => onChange(field.name, option.value)}
                required={field.required}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <FieldMeta error={error} field={field} />
      </fieldset>
    );
  }

  if (field.unitOptions) {
    return (
      <label className="field-block">
        <FieldLabel field={field} />
        <div
          className={
            error || unitError
              ? 'unit-input-control unit-input-control--invalid'
              : 'unit-input-control'
          }
        >
          <input
            aria-describedby={describedBy}
            aria-invalid={Boolean(error || unitError)}
            className="field-input"
            disabled={disabled}
            inputMode="decimal"
            onChange={handleChange}
            placeholder="0,25"
            required={field.required}
            type="text"
            value={value}
          />
          <select
            aria-label="Одиниця виміру"
            aria-describedby={unitError ? `${unitFieldName}-error` : undefined}
            aria-invalid={Boolean(unitError)}
            className="field-unit-select"
            disabled={disabled || !hasValue}
            onChange={handleUnitChange}
            required={hasValue}
            value={hasValue ? unitValue : ''}
          >
            <option disabled hidden value="">Оберіть</option>
            {field.unitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <FieldMeta error={error} field={field} unitError={unitError} unitFieldName={unitFieldName} />
      </label>
    );
  }

  return (
    <label className="field-block">
      <FieldLabel field={field} />
      <input
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className="field-input"
        disabled={disabled}
        inputMode={field.type === 'tel' ? 'tel' : undefined}
        onChange={handleChange}
        placeholder={field.placeholder}
        required={field.required}
        type={field.type === 'number' ? 'number' : field.type}
        value={value}
      />
      <FieldMeta error={error} field={field} />
    </label>
  );
}

function FieldLabel({ field }) {
  return (
    <span>
      {field.label}
      {field.required ? <small className="field-unit"> обов’язково</small> : null}
      {field.unit && !field.unitOptions ? <small className="field-unit"> {field.unit}</small> : null}
    </span>
  );
}

function FieldMeta({ error, field, unitError = '', unitFieldName = '' }) {
  if (!field.helpText && !error && !unitError) {
    return null;
  }

  return (
    <>
      {field.helpText ? (
        <small className="field-help" id={`${field.name}-help`}>
          {field.helpText}
        </small>
      ) : null}
      {error ? (
        <small className="form-error field-error" id={`${field.name}-error`}>
          {error}
        </small>
      ) : null}
      {unitError ? (
        <small className="form-error field-error" id={`${unitFieldName}-error`}>
          {unitError}
        </small>
      ) : null}
    </>
  );
}
