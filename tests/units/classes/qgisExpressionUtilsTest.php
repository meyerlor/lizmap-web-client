<?php

use PHPUnit\Framework\TestCase;

/**
 * @internal
 *
 * @coversNothing
 */
class qgisExpressionUtilsTest extends TestCase
{
    public function testCriteriaFromExpression(): void
    {
        $exp = '"name" IS NOT NULL AND "name" <> \'\'';
        $dependencies = qgisExpressionUtils::getCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = 'try( to_int( "pkuid" ), -1 ) >= 0';
        $dependencies = qgisExpressionUtils::getCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('pkuid', $dependencies));

        $exp = 'regexp_match( "description", \'\bphotos?\b\' )';
        $dependencies = qgisExpressionUtils::getCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('description', $dependencies));

        $exp = '"name" IS NOT NULL AND "name" <> \'\' AND try( to_int( "pkuid" ), -1 ) >= 0 AND regexp_match( "description", \'\bphotos?\b\' )';
        $dependencies = qgisExpressionUtils::getCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 3);
        $this->assertTrue(in_array('name', $dependencies));
        $this->assertTrue(in_array('pkuid', $dependencies));
        $this->assertTrue(in_array('description', $dependencies));
    }

    public function testCriteriaFromExpressions(): void
    {
        $exp = '"name" IS NOT NULL AND "name" <> \'\'';
        $dependencies = qgisExpressionUtils::getCriteriaFromExpressions(
            array($exp)
        );

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $dependencies = qgisExpressionUtils::getCriteriaFromExpressions(
            array('test' => $exp)
        );

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp2 = 'try( to_int( "pkuid" ), -1 ) >= 0';
        $exp3 = 'regexp_match( "description", \'\bphotos?\b\' )';
        $dependencies = qgisExpressionUtils::getCriteriaFromExpressions(
            array($exp, $exp2, $exp3)
        );

        $this->assertEquals(count($dependencies), 3);
        $this->assertTrue(in_array('name', $dependencies));
        $this->assertTrue(in_array('pkuid', $dependencies));
        $this->assertTrue(in_array('description', $dependencies));

        $dependencies = qgisExpressionUtils::getCriteriaFromExpressions(
            array(
                'test' => $exp,
                'group-tab' => $exp2,
                'edition-group0' => $exp3)
        );

        $this->assertEquals(count($dependencies), 3);
        $this->assertTrue(in_array('name', $dependencies));
        $this->assertTrue(in_array('pkuid', $dependencies));
        $this->assertTrue(in_array('description', $dependencies));
    }

    public function testCurrentValueCriteriaFromExpression(): void
    {
        $exp = '"old_name" = current_value(\'name\')';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = '"old_name" = current_value(   \'name\')';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = '"old_name" = current_value(\'name\'   )';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = '"old_name" = current_value(   \'name\' )';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = '"old_name" = my_current_value(\'name\')';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 0);

        $exp = '"old_name" =current_value(\'name\')';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = '"old_name" =current_value(\'name\')||\'test\'';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = 'current_value(\'name\') IS NOT NULL AND current_value(\'name\') <> \'\'';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('name', $dependencies));

        $exp = 'try( to_int( current_value(\'pkuid\') ), -1 ) >= 0';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('pkuid', $dependencies));

        $exp = 'regexp_match( current_value(\'description\'), \'\bphotos?\b\' )';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 1);
        $this->assertTrue(in_array('description', $dependencies));

        $exp = 'current_value(\'name\') IS NOT NULL AND current_value(\'name\') <> \'\' AND try( to_int( current_value(\'pkuid\') ), -1 ) >= 0 AND regexp_match( current_value(\'description\'), \'\bphotos?\b\' )';
        $dependencies = qgisExpressionUtils::getCurrentValueCriteriaFromExpression($exp);

        $this->assertEquals(count($dependencies), 3);
        $this->assertTrue(in_array('name', $dependencies));
        $this->assertTrue(in_array('pkuid', $dependencies));
        $this->assertTrue(in_array('description', $dependencies));
    }

    public function testCurrentGeometry(): void
    {
        $exp = '@current_geometry';
        $this->assertTrue(qgisExpressionUtils::hasCurrentGeometry($exp));

        $exp = 'my@current_geometry';
        $this->assertFalse(qgisExpressionUtils::hasCurrentGeometry($exp));

        $exp = ' @current_geometry ';
        $this->assertTrue(qgisExpressionUtils::hasCurrentGeometry($exp));

        $exp = 'intersects(@current_geometry, $geometry)';
        $this->assertTrue(qgisExpressionUtils::hasCurrentGeometry($exp));

        $exp = 'intersects(@current_geometry, $geometry) AND area(@current_geometry)>1000';
        $this->assertTrue(qgisExpressionUtils::hasCurrentGeometry($exp));

        $exp = 'intersects(buffer(@current_geometry,50), $geometry )';
        $this->assertTrue(qgisExpressionUtils::hasCurrentGeometry($exp));
    }

    protected static function getDbFieldsInfo(array $types)
    {
        $dbFieldsInfo = new qgisLayerDbFieldsInfo(null);
        foreach ($types as $name => $type) {
            // jDbFieldProperties
            $dbFieldsInfo->dataFields[$name] = (object) array(
                'name' => $name,
                'type' => $type[0],
                'unifiedType' => $type[1],
            );
        }

        return $dbFieldsInfo;
    }

    public function testFormValuesToFeatureProperties(): void
    {
        $dbFieldsInfo = self::getDbFieldsInfo(array(
            'id' => array('int4', 'integer'),
            'small' => array('int2', 'integer'),
            'done' => array('bool', 'boolean'),
            'checked' => array('bool', 'boolean'),
            'unchecked' => array('bool', 'boolean'),
            'flag' => array('boolean', 'boolean'),
            'custom' => array('bool', 'boolean'),
            'empty_bool' => array('bool', 'boolean'),
            'ratio' => array('float8', 'float'),
            'amount' => array('numeric', 'numeric'),
            'day' => array('date', 'date'),
            'empty_day' => array('date', 'date'),
            'at' => array('timestamp', 'datetime'),
            'hour' => array('time', 'time'),
            'name' => array('text', 'text'),
            'label' => array('varchar', 'varchar'),
            'yes_no' => array('text', 'text'),
            'tags' => array('_text', 'text'),
        ));
        $values = array(
            'id' => '12',
            'small' => '-3',
            'done' => 't',
            'checked' => 'true',
            'unchecked' => '0',
            'flag' => true,
            'custom' => 'Yes',
            'empty_bool' => '',
            'ratio' => '0.5',
            'amount' => '',
            'day' => '2026-10-26',
            'empty_day' => '',
            'at' => '',
            'hour' => '',
            'name' => '',
            'label' => 't',
            'yes_no' => 'Yes',
            'tags' => array('a', 'b'),
            'liz_layerId' => 'layer_id',
        );
        $checkboxValues = array(
            'custom' => array('Yes', 'No'),
            'yes_no' => array('Yes', 'No'),
        );

        $properties = qgisExpressionUtils::formValuesToFeatureProperties($values, $dbFieldsInfo, $checkboxValues);

        $this->assertSame(
            array(
                'id' => 12,
                'small' => -3,
                'done' => true,
                'checked' => true,
                'unchecked' => false,
                'flag' => true,
                'custom' => true,
                'empty_bool' => null,
                'ratio' => 0.5,
                'amount' => null,
                'day' => '2026-10-26',
                'empty_day' => null,
                'at' => null,
                'hour' => null,
                // QGIS keeps an empty string for text fields
                'name' => '',
                'label' => 't',
                // A text field with a checkbox widget keeps its values
                'yes_no' => 'Yes',
                'tags' => array('a', 'b'),
                // Not a layer field
                'liz_layerId' => 'layer_id',
            ),
            $properties
        );

        $properties = qgisExpressionUtils::formValuesToFeatureProperties(
            array('done' => 'f', 'custom' => 'No', 'id' => 'not a number'),
            $dbFieldsInfo,
            $checkboxValues
        );
        $this->assertSame(array('done' => false, 'custom' => false, 'id' => 'not a number'), $properties);

        // Without fields info, the values are unchanged
        $this->assertSame(array('done' => 't'), qgisExpressionUtils::formValuesToFeatureProperties(array('done' => 't'), null));
        $this->assertNull(qgisExpressionUtils::formValuesToFeatureProperties(null, $dbFieldsInfo));
    }

    public function testGetCheckboxValuesFromForm(): void
    {
        $checkbox = new jFormsControlCheckbox('done');
        $checkbox->valueOnCheck = 't';
        $checkbox->valueOnUncheck = 'f';
        $form = new class(array('done' => $checkbox, 'name' => new jFormsControlInput('name'))) {
            private $controls;

            public function __construct($controls)
            {
                $this->controls = $controls;
            }

            public function getControls()
            {
                return $this->controls;
            }
        };

        $this->assertSame(
            array('done' => array('t', 'f')),
            qgisExpressionUtils::getCheckboxValuesFromForm($form)
        );
    }
}
