export function DynamicApplicationFields({
  applicationType,
  disabled = false,
  onChange,
  values,
}) {
  return (
    <>
      {applicationType.groups.map((group) => (
        <div className="appendix-form-section field-block--wide" key={group.id}>
          <div>
            <span className="section-kicker">{applicationType.appendix}</span>
            <h3>{group.title}</h3>
          </div>

          {group.fields.map((field) => (
            <DynamicField
              disabled={disabled}
              field={field}
              key={field.name}
              onChange={onChange}
              value={values?.[field.name] ?? ''}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function DynamicField({ disabled, field, onChange, value }) {
  const describedBy = field.helpText ? `${field.name}-help` : undefined;

  if (field.type === 'textarea') {
    return (
      <label className="field-block field-block--wide">
        <FieldLabel field={field} />
        <textarea
          aria-describedby={describedBy}
          className="field-input field-textarea"
          disabled={disabled}
          onChange={(event) => onChange(field.name, event.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          rows={3}
          value={value}
        />
        <FieldMeta field={field} />
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="field-block">
        <FieldLabel field={field} />
        <select
          aria-describedby={describedBy}
          className="field-input"
          disabled={disabled}
          onChange={(event) => onChange(field.name, event.target.value)}
          required={field.required}
          value={value}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <FieldMeta field={field} />
      </label>
    );
  }

  if (field.type === 'radio') {
    return (
      <fieldset className="field-block dynamic-radio-group">
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
        <FieldMeta field={field} />
      </fieldset>
    );
  }

  return (
    <label className="field-block">
      <FieldLabel field={field} />
      <input
        aria-describedby={describedBy}
        className="field-input"
        disabled={disabled}
        onChange={(event) => onChange(field.name, event.target.value)}
        placeholder={field.placeholder}
        required={field.required}
        type={field.type === 'number' ? 'number' : field.type}
        value={value}
      />
      <FieldMeta field={field} />
    </label>
  );
}

function FieldLabel({ field }) {
  return (
    <span>
      {field.label}
      {field.unit ? <small className="field-unit"> {field.unit}</small> : null}
    </span>
  );
}

function FieldMeta({ field }) {
  if (!field.helpText) {
    return null;
  }

  return (
    <small className="field-help" id={`${field.name}-help`}>
      {field.helpText}
    </small>
  );
}
