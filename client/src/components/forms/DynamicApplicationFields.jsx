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
                value={values?.[field.name] ?? ''}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function DynamicField({ disabled, error, field, onChange, value }) {
  const describedBy = [
    field.helpText ? `${field.name}-help` : '',
    error ? `${field.name}-error` : '',
  ].filter(Boolean).join(' ') || undefined;

  function handleChange(event) {
    const nextValue = field.type === 'tel'
      ? formatUkrainianPhone(event.target.value)
      : event.target.value;

    onChange(field.name, nextValue);
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
      {field.unit ? <small className="field-unit"> {field.unit}</small> : null}
    </span>
  );
}

function FieldMeta({ error, field }) {
  if (!field.helpText && !error) {
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
    </>
  );
}
