var BaseTransformer = require('./base_transformer').BaseTransformer
  , utils = require('utilities')
  , operation = require('../../query/operation')
  , comparison = require('../../query/comparison')
  , datatypes = require('../../datatypes');

var sql = utils.mixin(new BaseTransformer(), new (function () {

  this.transformValue = function (prop, datatype) {
    var ret;
    // FIXME: Is special-casing this the right way to go?
    if (utils.isEmpty(prop)) {
      ret = 'NULL';
    }
    else {
      if (datatype == 'boolean') {
        ret = prop ? this.TRUE_VALUE : this.FALSE_VALUE;
        ret = String(ret);
      }
      else {
        ret = datatypes[datatype].serialize(prop, {
          escape: 'sql'
        , useQuotes: true
        });
      }
    }
    return ret;
  };

  this.transformSortOrder = function (sort, tableName) {
    var sql = ''
      , fieldArr = []
      , names
      , modelName
      , propertyName;
    for (var p in sort) {
      if (p.indexOf('.') > -1) {
        names = p.split('.');
        modelName = this._tableizeModelName(names[0]);
        propertyName = this._columnizePropertyName(names[1]);
      }
      else {
        modelName = this._tableizeModelName(tableName);
        propertyName = this._columnizePropertyName(p);
      }
      fieldArr.push(modelName + '.' + propertyName + ' ' + sort[p].toUpperCase());
    }
    sql += 'ORDER BY ' + fieldArr.join(', ');
    return sql;
  };

  this.transformConditions = function (conditions) {
    var sql = this.transformOperation(conditions);
    return sql;
  };

  this.transformOperation = function (op) {
    var self = this
      , ops = [];
    if (op.isEmpty()) {
      return '';
    }
    else {
      if (op.type == 'not') {
        return 'NOT (' + self.transformOperation(op.operand()) + ')';
      }
      else {
        op.forEach(function (o) {
          if (o instanceof operation.OperationBase) {
            ops.push(self.transformOperation(o));
          }
          else {
            ops.push(self.transformComparison(o));
          }
        });
        return '(' + ops.join(' ' + op.type.toUpperCase() + ' ') + ')';
      }
    }
  };

  this.transformComparison = function (comp) {
    return [this.transformComparisonFieldName(comp),
        this.transformComparisonComparator(comp),
        this.transformComparisonValue(comp)].join(' ');
  };

  this.transformComparisonFieldName = function (comp) {
    var val = comp.value
      , name;

    name = this._tableizeModelName(comp.model);
    name += '.';
    name += this._columnizePropertyName(comp.field);

    if (comp.opts.nocase && comp.datatype == 'string') {
      name = 'LOWER(' + name + ')';
    }

    // `<fieldname> IN ()` reduces to `false`
    if(comp instanceof comparison.InclusionComparison && !val.length) {
      name = '';
    }

    return name;
  };

  this.transformComparisonComparator = function (comp) {
    var val = comp.value
      , comparator = comp.sqlComparatorString;

    if (val === null) {
      comparator = (comp instanceof comparison.EqualToComparison) ?
        'IS' : 'IS NOT';
    }

    // `<fieldname> IN ()` reduces to `false`
    if(comp instanceof comparison.InclusionComparison && !val.length) {
      comparator = '';
    }

    return comparator;
  };

  // FIXME: This should integrate better with `transformValue`
  this.transformComparisonValue = function (comp) {
    var self = this
      , val = comp.value
      , ret = '';

    if (utils.isEmpty(val)) {
      ret = 'NULL';
    }
    else {
      if (comp instanceof comparison.LikeComparison) {
        // Prefix with percent if they didn't include one
        if (val.indexOf('%') == -1) {
          val += '%';
        }
      }

      // Inclusion, multiple values
      if (comp instanceof comparison.InclusionComparison) {
        ret = [];
        val.forEach(function (item) {
          item = self.transformValue(item, comp.datatype);

          if (comp.opts.nocase) {
            item = 'LOWER(' + item + ')';
          }

          ret.push(item);
        });

        // `<fieldname> IN ()` reduces to `false`
        if(!ret.length)
          ret = 'false';
        else
          ret = '(' + ret.join(', ') + ')';
      }
      // Single val
      else {
        ret = this.transformValue(val, comp.datatype);

        if (comp.opts.nocase) {
          ret = 'LOWER(' + ret + ')';
        }
      }
    }
    return ret;
  };

})());

module.exports = sql;


